import { Arr } from '@ephox/katamari';
import { Selectors, SugarElement, SugarNode, SugarText, Traverse } from '@ephox/sugar';

import Editor from '../api/Editor';
import { isCaretNode } from '../fmt/FormatContainer';
import * as FormatUtils from '../fmt/FormatUtils';
import { ZWSP } from '../text/Zwsp';
import { isAnnotation } from './Identification';

export const enum ChildContext {
  // Was previously used for br and zero width cursors. Keep as a state
  // because we'll probably want to reinstate it later.
  Skipping = 'skipping',
  Existing = 'existing',
  InvalidChild = 'invalid-child',
  Caret = 'caret',
  Valid = 'valid',
  // Apply annotation directly on elem
  ValidBlock = 'valid-block',
  // Wrap elem in its own span
  ValidWrapBlock = 'valid-wrap-block'
}

// const validBlocks = 'img video audio iframe pre[class*=language-][contenteditable="false"]'.split(' ');
// const validBlocks = 'pre[class*=language-][contenteditable="false"]'.split(' ');
// const validWrapBlocks = 'img video audio iframe span.mce-preview-object'.split(' ');
// Testing validBlocks. Real list is above
// TODO: Should we add something to annotator API so direct blocks can be registered
const validBlocks = [
  // Codesample plugin
  'pre[class*=language-][contenteditable="false"]',
  // Image plugin - captioned image
  'figure.image',
  // Mediaembed plugin
  'div[data-ephox-embed-iri]',
  // Pageembed plugin
  'div.tiny-pageembed',
  // Tableofcontents plugin
  // TODO: This will not always work as class can be specified via tableofcontents_class option
  'div.mce-toc'
];
const validWrapBlocks = 'img video audio'.split(' ');

const isZeroWidth = (elem: SugarElement<Node>): boolean =>
  SugarNode.isText(elem) && SugarText.get(elem) === ZWSP;

const context = (editor: Editor, elem: SugarElement, wrapName: string, nodeName: string): ChildContext => Traverse.parent(elem).fold(
  () => ChildContext.Skipping,

  (parent) => {
    // We used to skip these, but given that they might be representing empty paragraphs, it probably
    // makes sense to treat them just like text nodes
    if (nodeName === 'br' || isZeroWidth(elem)) {
      return ChildContext.Valid;
    } else if (isAnnotation(elem)) {
      return ChildContext.Existing;
    } else if (isCaretNode(elem.dom)) {
      return ChildContext.Caret;
    } else if (Arr.exists(validBlocks, (selector) => Selectors.is(elem, selector))) {
      return ChildContext.ValidBlock;
      // return ChildContext.ValidWrapBlock;
    } else if (Arr.exists(validWrapBlocks, (selector) => Selectors.is(elem, selector))) {
      return ChildContext.ValidWrapBlock;
    } else if (!FormatUtils.isValid(editor, wrapName, nodeName) || !FormatUtils.isValid(editor, SugarNode.name(parent), wrapName)) {
      return ChildContext.InvalidChild;
    } else {
      return ChildContext.Valid;
    }
  }
);

export {
  context
};
