import { UiFinder, Cursors } from '@ephox/agar';
import { context, describe, it } from '@ephox/bedrock-client';
import { Arr } from '@ephox/katamari';
import { Value } from '@ephox/sugar';
import { TinyAssertions, TinyHooks, TinySelections, TinyUiActions } from '@ephox/wrap-mcagar';
import { assert } from 'chai';

import Editor from 'tinymce/core/api/Editor';
import CodeSamplePlugin from 'tinymce/plugins/codesample/Plugin';
import MediaPlugin from 'tinymce/plugins/media/Plugin';

import { annotate, assertHtmlContent } from '../../module/test/AnnotationAsserts';

describe('browser.tinymce.core.annotate.AnnotateBlocksTest', () => {
  const hook = TinyHooks.bddSetupLight<Editor>({
    plugins: 'codesample media',
    base_url: '/project/tinymce/js/tinymce',
    setup: (ed: Editor) => {
      ed.on('init', () => {
        ed.annotator.register('test-annotation', {
          decorate: (uid, data) => ({
            attributes: {
              'data-test-anything': data.anything
            },
            classes: []
          })
        });
      });
    }
  }, [ CodeSamplePlugin, MediaPlugin ], true);

  const expectedAnnotationAttrs = 'data-test-anything="one-block" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';

  const selectionPath = (startPath: number[], soffset: number, finishPath: number[], foffset: number): Cursors.CursorPath => ({
    startPath,
    soffset,
    finishPath,
    foffset
  });

  const testAnnotationOnSelection = (
    editor: Editor,
    html: string,
    setSelection: (editor: Editor) => void,
    expectedHtml: string[],
    expectedSelection: Cursors.CursorPath,
    expectedAnnotationCount: number
  ): void => {
    editor.setContent(html);
    setSelection(editor);
    annotate(editor, 'test-annotation', 'test-uid', { anything: 'one-block' });
    TinyAssertions.assertContentPresence(editor, {
      '.mce-annotation': expectedAnnotationCount
    });
    assertHtmlContent(editor, expectedHtml);
    TinyAssertions.assertSelection(editor, expectedSelection.startPath, expectedSelection.soffset, expectedSelection.finishPath, expectedSelection.foffset);
  };

  const testDirectSelectionAnnotation = (
    editor: Editor,
    html: string,
    selector: string,
    expectedHtml: string[],
    expectedSelection: Cursors.CursorPath,
    expectedAnnotationCount: number = 1
  ): void =>
    testAnnotationOnSelection(
      editor,
      `<p>Before</p>${html}<p>After</p>`,
      () => TinySelections.select(editor, selector, []),
      [
        '<p>Before</p>',
        ...expectedHtml,
        '<p>After</p>'
      ],
      expectedSelection,
      expectedAnnotationCount
    );

  const testAllContentSelectionAnnotation = (
    editor: Editor,
    html: string,
    expectedHtml: string[],
    expectedSelection: Cursors.CursorPath,
    expectedAnnotationCount: number
  ): void =>
    testAnnotationOnSelection(
      editor,
      `<p>Before</p>${html}<p>After</p>`,
      () => editor.execCommand('SelectAll'),
      [
        `<p><span ${expectedAnnotationAttrs}>Before</span></p>`,
        ...expectedHtml,
        `<p><span ${expectedAnnotationAttrs}>After</span></p>`,
      ],
      expectedSelection,
      expectedAnnotationCount
    );

  // const testDirectSelectionAnnotation = (editor: Editor, html: string, selector: string, expectedHtml: string, expectedSelection: Cursors.CursorPath): void => {
  //   editor.setContent(`<p>Before</p>${html}<p>After</p>`);
  //   TinySelections.select(editor, selector, []);
  //   annotate(editor, 'test-annotation', 'test-uid', { anything: 'one-block' });
  //   assertHtmlContent(editor, [
  //     '<p>Before</p>',
  //     expectedHtml,
  //     '<p>After</p>'
  //   ]);
  //   TinyAssertions.assertSelection(editor, expectedSelection.startPath, expectedSelection.soffset, expectedSelection.finishPath, expectedSelection.foffset);
  // };

  context('Annotating inline media blocks', () => {
    Arr.each([ 'img' ], (blockName) => {
      context(blockName, () => {
        it('TINY-8698: should annotate inline block when directly selected', () => {
          const editor = hook.editor();
          editor.setContent('<p>Before image</p><p>before<img src="https://www.w3schools.com/w3css/img_lights.jpg" alt="" width="600" height="400">after</p><p>After image</p>');
          TinySelections.select(editor, 'img', []);
          annotate(editor, 'test-annotation', 'test-uid', { anything: 'one-block' });
          assertHtmlContent(editor, [
            '<p>Before image</p>',
            '<p>before' +
            '<span data-test-anything="one-block" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation">' +
            '<img src="https://www.w3schools.com/w3css/img_lights.jpg" alt="" width="600" height="400">' +
            '</span>' +
            'after</p>',
            '<p>After image</p>'
          ]);

          TinyAssertions.assertSelection(editor, [ 1, 1 ], 0, [ 1, 1 ], 1);
        });

        it('TINY-8698: should split annotation span around inline block and annotate it separately when all content is selected', () => {
          const editor = hook.editor();
          editor.setContent('<p>Before image</p><p>before<img src="https://www.w3schools.com/w3css/img_lights.jpg" alt="" width="600" height="400">after</p><p>After image</p>');
          editor.execCommand('SelectAll');
          annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
          const expectedAnnotationSpanHtml = '<span data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation">';
          assertHtmlContent(editor, [
            `<p>${expectedAnnotationSpanHtml}Before image</span></p>`,
            `<p>` +
            `${expectedAnnotationSpanHtml}before</span>` +
            `${expectedAnnotationSpanHtml}<img src="https://www.w3schools.com/w3css/img_lights.jpg" alt="" width="600" height="400"></span>` +
            `${expectedAnnotationSpanHtml}after</span>` +
            '</p>',
            `<p>${expectedAnnotationSpanHtml}After image</span></p>`
          ]);

          TinyAssertions.assertSelection(editor, [], 0, [], 3);
        });
      });
    });
  });

  context('image with caption', () => {
    // Test figure and caption can be annotated
    // const pInsertImage = async (editor: Editor, src: string, caption: boolean = false) => {
    //   editor.execCommand('mceImage');
    //   const dialog = await TinyUiActions.pWaitForDialog(editor);
    //   setInputValue('label.tox-label:contains("Source")', '');
    //   Mouse.clickOn(dialog, 'label:contains("Show caption") input[type="checkbox"]');
    //   TinyUiActions.submitDialog(editor);
    // };
    const imgHtml = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">`;

    it('TINY-8698: should annotate figure when captioned image is directly selected', () => {
      testDirectSelectionAnnotation(
        hook.editor(),
        `<figure class="image">${imgHtml}<figcaption>x</figcaption></figure>`,
        'figure',
        [ `<figure class="image" ${expectedAnnotationAttrs}>${imgHtml}<figcaption>x</figcaption></figure>` ],
        selectionPath([], 1, [], 2),
        1
      );
    });

    it('TINY-8698: should annotate figure when captioned image is part of selection', () => {
      testAllContentSelectionAnnotation(
        hook.editor(),
        `<figure class="image">${imgHtml}<figcaption>x</figcaption></figure>`,
        [ `<figure class="image" ${expectedAnnotationAttrs}>${imgHtml}<figcaption>x</figcaption></figure>` ],
        selectionPath([], 0, [], 3),
        3
      );
    });

    it('TINY-8698: Should be able to annotate both figure and caption text', () => {
      const editor = hook.editor();
      testDirectSelectionAnnotation(
        hook.editor(),
        `<figure class="image">${imgHtml}<figcaption>x</figcaption></figure>`,
        'figure',
        [ `<figure class="image" ${expectedAnnotationAttrs}>${imgHtml}<figcaption>x</figcaption></figure>` ],
        selectionPath([], 1, [], 2),
        1
      );

      testAnnotationOnSelection(
        editor,
        editor.getContent(),
        () => TinySelections.setCursor(editor, [ 1, 1, 0 ], 0),
        [
          `<p>Before</p>`,
          `<figure class="image" ${expectedAnnotationAttrs}>${imgHtml}<figcaption><span ${expectedAnnotationAttrs}>x</span></figcaption></figure>`,
          `<p>After</p>`
        ],
        selectionPath([ 1 ], 1, [ 1 ], 2),
        2
      );
    });

    // TODO: Test removing caption/figure from image using image dialog
  });

  context('media', () => {
    const iframeHtml = '<iframe src="https://www.youtube.com/embed/8aGhZQkoFbQ" width="560" height="314" allowfullscreen="allowfullscreen"></iframe>';
    const audioHtml = '<audio src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3" controls="controls"></audio>';
    const videoHtml = '<video controls="controls" width="300" height="150"><source src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" type="video/mp4"></video>';

    Arr.each([
      { label: 'iframe (YouTube video)', selector: 'iframe', html: iframeHtml },
      { label: 'audio', selector: 'audio', html: audioHtml },
      { label: 'video', selector: 'video', html: videoHtml }
    ], ({ label, selector, html }) => {
      context(label, () => {
        it('should have wrapping mce-preview-object span', () => {
          const editor = hook.editor();
          editor.setContent(`<p>${html}</p>`);
          TinyAssertions.assertContentPresence(editor, {
            'span.mce-preview-object': 1
          });
        });

        it('TINY-8698: should apply annotation span around preview span when directly selected', () => {
          const editor = hook.editor();
          editor.setContent(`<p>Before</p><p>before${html}after</p><p>After</p>`);
          TinySelections.select(editor, 'span.mce-preview-object', []);
          annotate(editor, 'test-annotation', 'test-uid', { anything: 'one-block' });
          assertHtmlContent(editor, [
            '<p>Before</p>',
            '<p>before' +
            '<span data-test-anything="one-block" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation">' +
            `<span contenteditable="false" data-mce-object="${selector}">` +
            html +
            '<span class="mce-shim"></span>' +
            '</span>' +
            '</span>' +
            'after</p>',
            '<p>After</p>'
          ]);

          TinyAssertions.assertSelection(editor, [ 1, 1 ], 0, [ 1 ], 2);
        });

        it('TINY-8698: should apply annotation span around all paragraph content when all content is selected', () => {
          const editor = hook.editor();
          const expectedAnnotationAttrs = 'data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';
          const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;

          editor.setContent(`<p>Before</p><p>before${html}after</p><p>After</p>`);
          editor.execCommand('SelectAll');
          annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
          assertHtmlContent(editor, [
            `<p>${expectedAnnotationSpan}Before</span></p>`,
            `<p>${expectedAnnotationSpan}before` +
            `<span contenteditable="false" data-mce-object="${selector}">` +
            html +
            `<span class="mce-shim"></span>` +
            `</span>` +
            `after</span></p>`,
            `<p>${expectedAnnotationSpan}After</span></p>`,
          ]);

          TinyAssertions.assertSelection(editor, [], 0, [], 3);
        });

        it('TINY-8698: should apply annotation span around selected content in paragraph', () => {
          const editor = hook.editor();
          const expectedAnnotationAttrs = 'data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';
          const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;

          editor.setContent(`<p>Before</p><p>before${html}after</p><p>After</p>`);
          TinySelections.setRawSelection(editor, [ 1, 0 ], 3, [ 1, 2 ], 3);
          annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
          assertHtmlContent(editor, [
            `<p>Before</p>`,
            `<p>bef${expectedAnnotationSpan}ore` +
            `<span contenteditable="false" data-mce-object="${selector}">` +
            html +
            `<span class="mce-shim"></span>` +
            `</span>` +
            `aft</span>er</p>`,
            `<p>After</p>`,
          ]);

          TinyAssertions.assertSelection(editor, [ 1 ], 1, [ 1 ], 2);
        });
      });
    });
  });

  context('code sample', () => {
    const pInsertCodeSample = async (editor: Editor, newContent: string, expectedExistingContent: string = '') => {
      editor.execCommand('codesample');
      const dialog = await TinyUiActions.pWaitForDialog(editor);
      const textarea = UiFinder.findIn<HTMLTextAreaElement>(dialog, 'textarea').getOrDie();
      assert.equal(Value.get(textarea), expectedExistingContent);
      Value.set(textarea, newContent);
      TinyUiActions.submitDialog(editor);
    };

    it('TINY-8698: should annotate codesample directly when selected', async () => {
      const editor = hook.editor();
      const expectedAnnotationAttrs = 'data-test-anything="one-block" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';

      editor.setContent('');
      await pInsertCodeSample(editor, 'test');
      TinySelections.select(editor, 'pre', []);
      annotate(editor, 'test-annotation', 'test-uid', { anything: 'one-block' });
      assertHtmlContent(editor, [
        `<pre class="language-markup" contenteditable="false" ${expectedAnnotationAttrs}>test</pre>`,
      ], true);
      TinyAssertions.assertSelection(editor, [], 0, [], 1);

      // Make sure updating the codesample doesnt' affect anything
      await pInsertCodeSample(editor, 'test2', 'test');
      assertHtmlContent(editor, [
        `<pre class="language-markup" contenteditable="false" ${expectedAnnotationAttrs}>test2</pre>`,
      ], true);
      TinyAssertions.assertSelection(editor, [], 0, [], 1);
    });

    it('TINY-8698: should annotate codesample directly when in ranged selection', async () => {
      const editor = hook.editor();
      const expectedAnnotationAttrs = 'data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';
      const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;

      editor.setContent('<p>beforeafter</p>');
      TinySelections.setCursor(editor, [ 0, 0 ], 'before'.length);
      await pInsertCodeSample(editor, 'test');
      editor.execCommand('SelectAll');
      annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
      assertHtmlContent(editor, [
        `<p>${expectedAnnotationSpan}before</span>`,
        `<pre class="language-markup" contenteditable="false" ${expectedAnnotationAttrs}>test</pre>`,
        `<p>${expectedAnnotationSpan}after</span>`,
      ]);
      TinyAssertions.assertSelection(editor, [], 0, [], 3);

      // Make sure updating the codesample doesnt' affect anything
      TinySelections.select(editor, 'pre', []);
      await pInsertCodeSample(editor, 'test2', 'test');
      assertHtmlContent(editor, [
        `<p>${expectedAnnotationSpan}before</span>`,
        `<pre class="language-markup" contenteditable="false" ${expectedAnnotationAttrs}>test2</pre>`,
        `<p>${expectedAnnotationSpan}after</span>`,
      ], true);
      TinyAssertions.assertSelection(editor, [], 1, [], 2);
    });

    it('TINY-8698: should be able to remove annotation from codesample when it is selected', async () => {
      const editor = hook.editor();
      const expectedAnnotationAttrs = 'data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';
      const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;

      editor.setContent('<p>beforeafter</p>');
      TinySelections.setCursor(editor, [ 0, 0 ], 'before'.length);
      await pInsertCodeSample(editor, 'test');
      editor.execCommand('SelectAll');
      annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
      assertHtmlContent(editor, [
        `<p>${expectedAnnotationSpan}before</span>`,
        `<pre class="language-markup" contenteditable="false" ${expectedAnnotationAttrs}>test</pre>`,
        `<p>${expectedAnnotationSpan}after</span>`,
      ]);
      TinyAssertions.assertSelection(editor, [], 0, [], 3);

      TinySelections.select(editor, 'pre', []);
      editor.annotator.remove('test-annotation');
      // annotator works by getting the uid from the annotation currently selecteding, that removing all annotations with that uid
      TinyAssertions.assertContentPresence(editor, {
        '.mce-annotation': 0
      });
      assertHtmlContent(editor, [
        `<p>before</p>`,
        `<pre class="language-markup" contenteditable="false">test</pre>`,
        `<p>after</p>`,
      ], true);
      TinyAssertions.assertSelection(editor, [], 1, [], 2);
    });

    it('TINY-8698: should be able to remove annotation from codesample when annotation with same uid is selected', async () => {
      const editor = hook.editor();
      const expectedAnnotationAttrs = 'data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';
      const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;

      editor.setContent('<p>beforeafter</p>');
      TinySelections.setCursor(editor, [ 0, 0 ], 'before'.length);
      await pInsertCodeSample(editor, 'test');
      editor.execCommand('SelectAll');
      annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
      assertHtmlContent(editor, [
        `<p>${expectedAnnotationSpan}before</span>`,
        `<pre class="language-markup" contenteditable="false" ${expectedAnnotationAttrs}>test</pre>`,
        `<p>${expectedAnnotationSpan}after</span>`,
      ]);
      TinyAssertions.assertSelection(editor, [], 0, [], 3);

      TinySelections.setCursor(editor, [ 0, 0, 0 ], 1);
      editor.annotator.remove('test-annotation');
      // annotator works by getting the uid from the annotation currently selecteding, that removing all annotations with that uid
      TinyAssertions.assertContentPresence(editor, {
        '.mce-annotation': 0
      });
      assertHtmlContent(editor, [
        `<p>before</p>`,
        `<pre class="language-markup" contenteditable="false">test</pre>`,
        `<p>after</p>`,
      ]);
      TinyAssertions.assertCursor(editor, [ 0, 0 ], 1);
    });

    it('TINY-8698: should be able to remove annotation from codesample when it is selected without affecting different neighbouring annotations', async () => {
      const editor = hook.editor();
      const expectedAnnotationAttrs = 'data-test-anything="first-paragraph" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid1" class="mce-annotation"';
      const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;

      editor.setContent('<p>beforeafter</p>');
      TinySelections.setCursor(editor, [ 0, 0 ], 'before'.length);
      await pInsertCodeSample(editor, 'test');
      TinySelections.setSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 'before'.length);
      annotate(editor, 'test-annotation', 'test-uid1', { anything: 'first-paragraph' });
      TinySelections.select(editor, 'pre', []);
      annotate(editor, 'test-annotation', 'test-uid2', { anything: 'code' });

      editor.annotator.remove('test-annotation');
      TinyAssertions.assertContentPresence(editor, {
        '.mce-annotation': 1,
      });
      assertHtmlContent(editor, [
        `<p>${expectedAnnotationSpan}before</span></p>`,
        `<pre class="language-markup" contenteditable="false">test</pre>`,
        `<p>after</p>`,
      ], true);
      TinyAssertions.assertSelection(editor, [], 1, [], 2);
    });

    it('TINY-8698: should be able to remove annotation from codesample when using `removeAll` API', async () => {
      const editor = hook.editor();

      editor.setContent('<p>beforeafter</p>');
      TinySelections.setCursor(editor, [ 0, 0 ], 'before'.length);
      await pInsertCodeSample(editor, 'test');
      TinySelections.setSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 'before'.length);
      annotate(editor, 'test-annotation', 'test-uid1', { anything: 'first-paragraph' });

      TinySelections.select(editor, 'pre', []);
      annotate(editor, 'test-annotation', 'test-uid2', { anything: 'code' });
      TinySelections.setCursor(editor, [ 2, 0 ], 1);

      editor.annotator.removeAll('test-annotation');
      // annotator works by getting the uid from the annotation currently selecteding, that removing all annotations with that uid
      TinyAssertions.assertContentPresence(editor, {
        '.mce-annotation': 0,
      });
      assertHtmlContent(editor, [
        `<p>before</p>`,
        `<pre class="language-markup" contenteditable="false">test</pre>`,
        `<p>after</p>`,
      ], true);
      TinyAssertions.assertCursor(editor, [ 2, 0 ], 1);
    });

    // it('TINY-8698: should fire `annotationChange` API callback when annotated codesample is selected', async () => {
    //   const editor = hook.editor();
    //   const expectedAnnotationAttrs = 'data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';
    //   const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;
    //   let callbackFireCount = 0;
    //   editor.annotator.annotationChanged('test-annotation', (state, name, data) => {
    //     console.log(state, name, data);
    //     assert.isTrue(state);
    //     assert.equal(name, 'test-annotation');
    //     // assert.deepEqual(data, { });
    //     callbackFireCount++;
    //   });

    //   editor.setContent('<p>beforeafter</p>');
    //   TinySelections.setCursor(editor, [ 0, 0 ], 'before'.length);
    //   await pInsertCodeSample(editor, 'test');
    //   editor.execCommand('SelectAll');
    //   annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
    //   assertHtmlContent(editor, [
    //     `<p>${expectedAnnotationSpan}before</span>`,
    //     `<pre class="language-markup" contenteditable="false" ${expectedAnnotationAttrs}>test</pre>`,
    //     `<p>${expectedAnnotationSpan}after</span>`,
    //   ]);
    //   TinyAssertions.assertSelection(editor, [], 0, [], 3);

    //   // Make sure updating the codesample doesnt' affect anything
    //   TinySelections.select(editor, 'pre', []);
    //   assert.equal(callbackFireCount, 1);
    // });

    it('TINY-8698: should annotate `pre` children if not the exact same as codesample structure', () => {
      const editor = hook.editor();
      const expectedAnnotationAttrs = 'data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation"';
      const expectedAnnotationSpan = `<span ${expectedAnnotationAttrs}>`;

      editor.setContent('<p>before</p><pre>test1</pre><pre contenteditable="false">test2</pre><p>after</p>');
      editor.execCommand('SelectAll');
      annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
      assertHtmlContent(editor, [
        `<p>${expectedAnnotationSpan}before</span></p>`,
        `<pre>${expectedAnnotationSpan}test1</span></pre>`,
        `<pre contenteditable="false">${expectedAnnotationSpan}test2</span></pre>`,
        `<p>${expectedAnnotationSpan}after</span></p>`,
      ]);
      TinyAssertions.assertSelection(editor, [], 0, [], 4);
    });

    // TODO: Make sure annotation change listener works

  });

  context('hr block', () => {
    it('TINY-8698: should not annotate hr block if directly selected', () => {
      const editor = hook.editor();
      editor.setContent('<p>Before hr</p><hr><p>After hr</p>');
      TinySelections.select(editor, 'hr', []);
      annotate(editor, 'test-annotation', 'test-uid', { anything: 'one-block' });
      assertHtmlContent(editor, [
        '<p>Before hr</p>',
        '<hr>',
        '<p>After hr</p>'
      ]);

      TinyAssertions.assertSelection(editor, [], 1, [], 2);
    });

    it('TINY-8698: should not annotate hr block when part of ranged selection', () => {
      const editor = hook.editor();
      editor.setContent('<p>Before hr</p><hr><p>After hr</p>');
      editor.execCommand('SelectAll');
      annotate(editor, 'test-annotation', 'test-uid', { anything: 'all-content' });
      const expectedAnnotationSpanHtml = '<span data-test-anything="all-content" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid" class="mce-annotation">';
      assertHtmlContent(editor, [
        `<p>${expectedAnnotationSpanHtml}Before hr</span></p>`,
        `<hr>`,
        `<p>${expectedAnnotationSpanHtml}After hr</span></p>`
      ]);

      TinyAssertions.assertSelection(editor, [], 0, [], 3);
    });
  });
});
