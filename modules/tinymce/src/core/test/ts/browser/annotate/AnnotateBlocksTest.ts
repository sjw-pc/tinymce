import { UiFinder, Cursors, Mouse, Waiter } from '@ephox/agar';
import { beforeEach, context, describe, it } from '@ephox/bedrock-client';
import { Arr } from '@ephox/katamari';
import { Value } from '@ephox/sugar';
import { TinyAssertions, TinyDom, TinyHooks, TinySelections, TinyUiActions } from '@ephox/wrap-mcagar';
import { assert } from 'chai';

import Editor from 'tinymce/core/api/Editor';
import CodeSamplePlugin from 'tinymce/plugins/codesample/Plugin';
import ImagePlugin from 'tinymce/plugins/image/Plugin';
import MediaPlugin from 'tinymce/plugins/media/Plugin';

import { annotate, assertHtmlContent } from '../../module/test/AnnotationAsserts';

interface AnnotationChangeData {
  readonly state: boolean;
  readonly uid: string;
  readonly rawNodes: Node[];
  readonly nodeNames: string[];
}

describe('browser.tinymce.core.annotate.AnnotateBlocksTest', () => {
  const hook = TinyHooks.bddSetupLight<Editor>({
    plugins: 'codesample media image',
    base_url: '/project/tinymce/js/tinymce',
    setup: (ed: Editor) => {
      ed.on('init', () => {
        ed.annotator.register('test-annotation', {
          decorate: (uid, data) => ({
            attributes: {
              'data-test-anything': data.anything
            },
            classes: [ 'test-class' ]
          })
        });
        ed.annotator.annotationChanged('test-annotation', (state, _name, data) => {
          annotationChangeData.push({
            state,
            uid: data.uid ?? '',
            rawNodes: data.nodes ?? [],
            nodeNames: Arr.map(data.nodes ?? [], (node) => (node as Node).nodeName.toLowerCase())
          });
        });
      });
    }
  }, [ CodeSamplePlugin, MediaPlugin, ImagePlugin ], true);

  let uidCounter = 0;
  let annotationChangeData: AnnotationChangeData[] = [];

  beforeEach(() => {
    uidCounter = 0;
    annotationChangeData = [];
  });

  // TODO: Add one for direct blocks data-mce-annoation-classes and data-mce-annotation-attributes
  const expectedSpanAnnotationAttrs = (uidPostfix: number = 1) =>
    `data-test-anything="something" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid-${uidPostfix}" class="mce-annotation test-class"`;
  const expectedBlockAnnotationAttrs = (uidPostfix: number = 1) =>
    `data-test-anything="something" data-mce-annotation="test-annotation" data-mce-annotation-uid="test-uid-${uidPostfix}" class="mce-annotation test-class" data-mce-annotation-classes="test-class" data-mce-annotation-attrs="data-test-anything"`;

  const selectionPath = (startPath: number[], soffset: number, finishPath: number[], foffset: number): Cursors.CursorPath => ({
    startPath,
    soffset,
    finishPath,
    foffset
  });

  const pAssertAnnotationChangeData = (expected: Omit<AnnotationChangeData, 'rawNodes'>[]) =>
    Waiter.pTryUntil('annotation change data should be correct', () => {
      assert.lengthOf(annotationChangeData, expected.length);
      Arr.each(annotationChangeData, (data, i) => {
        const expectedData = expected[i];
        // console.log(Arr.unique(data.rawNodes, (a, b) => a.isEqualNode(b)));
        // assert.lengthOf(Arr.unique(data.rawNodes, Fun.tripleEquals), data.rawNodes.length, 'All nodes should be unique');
        assert.equal(data.state, expectedData.state);
        assert.equal(data.uid, expectedData.uid);
        assert.deepEqual(data.nodeNames, expectedData.nodeNames);
      });

    });

  const testApplyAnnotationOnSelection = (
    editor: Editor,
    html: string,
    setSelection: (editor: Editor) => void,
    expectedHtml: string[],
    expectedSelection: Cursors.CursorPath,
    expectedAnnotationCount: number,
    allowExtrasInExpectedHtml: boolean = false
  ): void => {
    editor.setContent(html);
    setSelection(editor);
    uidCounter += 1;
    annotate(editor, 'test-annotation', `test-uid-${uidCounter}`, { anything: 'something' });
    TinyAssertions.assertContentPresence(editor, {
      '.mce-annotation': expectedAnnotationCount
    });
    assertHtmlContent(editor, expectedHtml, allowExtrasInExpectedHtml);
    TinyAssertions.assertSelection(editor, expectedSelection.startPath, expectedSelection.soffset, expectedSelection.finishPath, expectedSelection.foffset);
  };

  const testRemoveAnnotationOnSelection = (
    editor: Editor,
    setSelection: (editor: Editor) => void,
    expectedHtml: string[],
    expectedSelection: Cursors.CursorPath,
    removeAll: boolean,
    expectedAnnotationCount: number = 0,
    allowExtrasInExpectedHtml: boolean = false
  ): void => {
    setSelection(editor);
    const remover = removeAll ? editor.annotator.removeAll : editor.annotator.remove;
    remover('test-annotation');
    TinyAssertions.assertContentPresence(editor, {
      '.mce-annotation': expectedAnnotationCount
    });
    assertHtmlContent(editor, expectedHtml, allowExtrasInExpectedHtml);
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
    testApplyAnnotationOnSelection(
      editor,
      `<p>Before</p>${html}<p>After</p>`,
      () => Mouse.trueClickOn(TinyDom.body(editor), selector),
      [
        '<p>Before</p>',
        ...expectedHtml,
        '<p>After</p>'
      ],
      expectedSelection,
      expectedAnnotationCount,
      true
    );

  const testAllContentSelectionAnnotation = (
    editor: Editor,
    html: string,
    expectedHtml: string[],
    expectedSelection: Cursors.CursorPath,
    expectedAnnotationCount: number
  ): void =>
    testApplyAnnotationOnSelection(
      editor,
      `<p>Before</p>${html}<p>After</p>`,
      () => editor.execCommand('SelectAll'),
      [
        `<p><span ${expectedSpanAnnotationAttrs()}>Before</span></p>`,
        ...expectedHtml,
        `<p><span ${expectedSpanAnnotationAttrs()}>After</span></p>`,
      ],
      expectedSelection,
      expectedAnnotationCount
    );

  context('image', () => {
    const imgHtml = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" width="600" height="400">`;

    it('TINY-8698: should apply annotation span around image when directly selected', () => {
      testDirectSelectionAnnotation(
        hook.editor(),
        `<p>before${imgHtml}after</p>`,
        'img',
        [
          '<p>before' +
          `<span ${expectedSpanAnnotationAttrs()}>` +
          imgHtml +
          '</span>' +
          'after</p>'
        ],
        selectionPath([ 1, 1 ], 0, [ 1, 1 ], 1)
      );
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

  context('image with caption', () => {
    const imgHtml = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt=""  width="600" height="400">`;

    it('TINY-8698: should annotate figure when captioned image is directly selected', () => {
      testDirectSelectionAnnotation(
        hook.editor(),
        `<figure class="image">${imgHtml}<figcaption>x</figcaption></figure>`,
        'img',
        [ `<figure class="image" ${expectedBlockAnnotationAttrs()}>${imgHtml}<figcaption>x</figcaption></figure>` ],
        selectionPath([], 1, [], 2),
        2 // Extra one for offscreen selection copy
      );
    });

    it('TINY-8698: should annotate figure when captioned image is part of selection', () => {
      testAllContentSelectionAnnotation(
        hook.editor(),
        `<figure class="image">${imgHtml}<figcaption>x</figcaption></figure>`,
        [ `<figure class="image" ${expectedBlockAnnotationAttrs()}>${imgHtml}<figcaption>x</figcaption></figure>` ],
        selectionPath([], 0, [], 3),
        3
      );
    });

    it('TINY-8698: Should be able to annotate both figure and caption text', () => {
      const editor = hook.editor();

      testDirectSelectionAnnotation(
        hook.editor(),
        `<figure class="image">${imgHtml}<figcaption>x</figcaption></figure>`,
        'img',
        [ `<figure class="image" ${expectedBlockAnnotationAttrs()}>${imgHtml}<figcaption>x</figcaption></figure>` ],
        selectionPath([], 1, [], 2),
        2 // Extra one for offscreen selection copy
      );

      testApplyAnnotationOnSelection(
        editor,
        editor.getContent(),
        () => TinySelections.setCursor(editor, [ 1, 1, 0 ], 0),
        [
          `<p>Before</p>`,
          `<figure class="image" ${expectedBlockAnnotationAttrs(1)}>${imgHtml}<figcaption><span ${expectedSpanAnnotationAttrs(2)}>x</span></figcaption></figure>`,
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
          testDirectSelectionAnnotation(
            hook.editor(),
            `<p>before${html}after</p>`,
            selector,
            [
              '<p>before' +
              `<span ${expectedSpanAnnotationAttrs()}>` +
              `<span contenteditable="false" data-mce-object="${selector}">` +
              html +
              '<span class="mce-shim"></span>' +
              '</span>' +
              '</span>' +
              'after</p>'
            ],
            selectionPath([ 1, 1 ], 0, [ 1 ], 2)
          );
        });

        it('TINY-8698: should apply annotation span around all paragraph content when all content is selected', () => {
          testAllContentSelectionAnnotation(
            hook.editor(),
            `<p>before${html}after</p>`,
            [
              `<p><span ${expectedSpanAnnotationAttrs()}>before` +
              `<span contenteditable="false" data-mce-object="${selector}">` +
              html +
              '<span class="mce-shim"></span>' +
              '</span>' +
              'after</span></p>'
            ],
            selectionPath([], 0, [], 3),
            3
          );
        });

        it('TINY-8698: should apply annotation span around selected content in paragraph', () => {
          testApplyAnnotationOnSelection(
            hook.editor(),
            `<p>Before</p><p>before${html}after</p><p>After</p>`,
            (editor) => TinySelections.setSelection(editor, [ 1, 0 ], 3, [ 1, 2 ], 3),
            [

              `<p>Before</p>`,
              `<p>bef<span ${expectedSpanAnnotationAttrs()}>ore` +
              `<span contenteditable="false" data-mce-object="${selector}">` +
              html +
              `<span class="mce-shim"></span>` +
              `</span>` +
              `aft</span>er</p>`,
              `<p>After</p>`,
            ],
            selectionPath([ 1 ], 1, [ 1 ], 2),
            1
          );
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

    const codesampleHtml = `<pre class="language-markup"><code>test</code></pre>`;

    it('TINY-8698: should annotate codesample directly when selected', async () => {
      const editor = hook.editor();

      testDirectSelectionAnnotation(
        editor,
        codesampleHtml,
        'pre',
        [ `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>` ],
        selectionPath([], 1, [], 2),
        2 // Extra one for offscreen selection copy
      );

      // Make sure updating the codesample doesnt' affect anything
      await pInsertCodeSample(editor, 'test2', 'test');
      assertHtmlContent(editor, [
        `<p>Before</p>`,
        `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test2</pre>`,
        `<p>After</p>`,
      ], true);
      TinyAssertions.assertSelection(editor, [], 1, [], 2);
    });

    it('TINY-8698: should annotate codesample directly when in ranged selection', () => {
      testAllContentSelectionAnnotation(
        hook.editor(),
        codesampleHtml,
        [ `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>` ],
        selectionPath([], 0, [], 3),
        3
      );
    });

    it('TINY-8698: should be able to remove annotation from codesample and other annotations of the same id when it is selected', () => {
      testAllContentSelectionAnnotation(
        hook.editor(),
        codesampleHtml,
        [ `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>` ],
        selectionPath([], 0, [], 3),
        3
      );

      testRemoveAnnotationOnSelection(
        hook.editor(),
        (editor) => Mouse.trueClickOn(TinyDom.body(editor), 'pre'),
        [
          `<p>Before</p>`,
          `<pre class="language-markup" contenteditable="false">test</pre>`,
          `<p>After</p>`,
        ],
        selectionPath([], 1, [], 2),
        false,
        0,
        true
      );
    });

    it('TINY-8698: should be able to remove annotation from codesample when another annotation with the same uid is selected', () => {
      testAllContentSelectionAnnotation(
        hook.editor(),
        codesampleHtml,
        [ `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>` ],
        selectionPath([], 0, [], 3),
        3
      );

      testRemoveAnnotationOnSelection(
        hook.editor(),
        (editor) => TinySelections.setCursor(editor, [ 0, 0, 0 ], 1),
        [
          `<p>Before</p>`,
          `<pre class="language-markup" contenteditable="false">test</pre>`,
          `<p>After</p>`,
        ],
        selectionPath([ 0, 0 ], 1, [ 0, 0 ], 1),
        false,
        0
      );
    });

    it('TINY-8698: should be able to remove annotation from codesample when it is selected without affecting different neighbouring annotations', () => {
      const editor = hook.editor();

      testDirectSelectionAnnotation(
        editor,
        codesampleHtml,
        'pre',
        [ `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>` ],
        selectionPath([], 1, [], 2),
        2 // Extra one for offscreen selection copy
      );

      testApplyAnnotationOnSelection(
        editor,
        editor.getContent(),
        () => TinySelections.setCursor(editor, [ 0, 0 ], 1),
        [
          `<p><span ${expectedSpanAnnotationAttrs(2)}>Before</span></p>`,
          `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>`,
          `<p>After</p>`,
        ],
        // Annotation logic changes selection to word wrap
        selectionPath([], 0, [], 1),
        2
      );

      testRemoveAnnotationOnSelection(
        editor,
        () => Mouse.trueClickOn(TinyDom.body(editor), 'pre'),
        [
          `<p><span ${expectedSpanAnnotationAttrs(2)}>Before</span></p>`,
          `<pre class="language-markup" contenteditable="false">test</pre>`,
          `<p>After</p>`,
        ],
        selectionPath([], 1, [], 2),
        false,
        1,
        true
      );
    });

    it('TINY-8698: should be able to remove annotation from codesample when using `removeAll` API', () => {
      const editor = hook.editor();

      testDirectSelectionAnnotation(
        editor,
        codesampleHtml,
        'pre',
        [ `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>` ],
        selectionPath([], 1, [], 2),
        2 // Extra one for offscreen selection copy
      );

      testApplyAnnotationOnSelection(
        editor,
        editor.getContent(),
        () => TinySelections.setCursor(editor, [ 0, 0 ], 1),
        [
          `<p><span ${expectedSpanAnnotationAttrs(2)}>Before</span></p>`,
          `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>`,
          `<p>After</p>`,
        ],
        // Annotation logic changes selection to word wrap
        selectionPath([], 0, [], 1),
        2
      );

      testRemoveAnnotationOnSelection(
        editor,
        () => TinySelections.setCursor(editor, [ 2, 0 ], 1),
        [
          `<p>Before</p>`,
          `<pre class="language-markup" contenteditable="false">test</pre>`,
          `<p>After</p>`,
        ],
        selectionPath([ 2, 0 ], 1, [ 2, 0 ], 1),
        true,
        0
      );
    });

    it('TINY-8698: should fire `annotationChange` API callback when annotated codesample is selected', async () => {
      const editor = hook.editor();

      testAllContentSelectionAnnotation(
        hook.editor(),
        codesampleHtml,
        [ `<pre class="language-markup" contenteditable="false" ${expectedBlockAnnotationAttrs()}>test</pre>` ],
        selectionPath([], 0, [], 3),
        3
      );

      TinySelections.select(editor, 'pre', []);
      await pAssertAnnotationChangeData([{ state: true, uid: 'test-uid-1', nodeNames: [ 'span', 'pre', 'span' ] }]);
    });

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
  });

  context('hr block', () => {
    it('TINY-8698: should not annotate hr block if directly selected', () => {
      testDirectSelectionAnnotation(
        hook.editor(),
        '<hr>',
        'hr',
        [ '<hr>' ],
        selectionPath([], 1, [], 2),
        0
      );
    });

    it('TINY-8698: should not annotate hr block when part of ranged selection', () => {
      testAllContentSelectionAnnotation(
        hook.editor(),
        '<hr>',
        [ '<hr>' ],
        selectionPath([], 0, [], 3),
        2
      );
    });
  });
});
