/** Render original question formatting with a strict DOM allowlist.
 * Original images are embedded raster data, so saved material works offline.
 * Only allowlisted nodes enter the page. Parsing stays in an inert template
 * so discarded external resources cannot load before sanitization.
 */
const tags = new Set(
  'div span p br strong b em i u s sub sup hr table thead tbody tfoot tr td th caption ul ol li blockquote img math semantics mrow mfrac mn msup mi mo msub msqrt mroot mover munder munderover mtable mtr mtd mtext msubsup mspace menclose mfenced annotation'.split(
    ' ',
  ),
);
const blocked = new Set(
  'script style iframe object embed template svg link meta base form input button audio video'.split(
    ' ',
  ),
);
const styles = new Set(
  'display position width max-width border-collapse border border-top border-left border-right border-bottom border-bottom-width text-align text-decoration left top margin padding font-weight font-style height vertical-align margin-right margin-left padding-left min-width'.split(
    ' ',
  ),
);
const mathTags = new Set(
  'math semantics mrow mfrac mn msup mi mo msub msqrt mroot mover munder munderover mtable mtr mtd mtext msubsup mspace menclose mfenced annotation'.split(
    ' ',
  ),
);
export type SourceAssets = Record<string, { mime: string; data: string }>;

export function sourceHtmlFragment(html: string, assets?: SourceAssets): DocumentFragment {
  const source = document.createElement('template');
  source.innerHTML = html;
  const fragment = document.createDocumentFragment();
  function append(node: Node, parent: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent || ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.localName.toLowerCase();
    if (blocked.has(tag)) return;
    if (!tags.has(tag)) {
      for (const child of element.childNodes) append(child, parent);
      return;
    }
    const copy = mathTags.has(tag)
      ? document.createElementNS('http://www.w3.org/1998/Math/MathML', tag)
      : document.createElement(tag);
    if (tag === 'img') {
      let src = element.getAttribute('src') || '';
      const reference = /^pastq-asset:([a-f0-9]{64})$/.exec(src);
      if (reference) {
        const asset = assets?.[reference[1]];
        if (!asset) {
          const missing = document.createElement('span');
          missing.className = 'source-image-missing';
          missing.setAttribute('role', 'status');
          missing.textContent = 'Image unavailable. Download this material again.';
          parent.appendChild(missing);
          return;
        }
        src = `data:${asset.mime};base64,${asset.data}`;
      }
      if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(src)) return;
      copy.setAttribute('src', src);
      copy.setAttribute('alt', element.getAttribute('alt') || 'Original question illustration');
      // Only the active question is mounted. Its diagrams must load immediately,
      // including inside nested scroll areas on mobile browsers.
      copy.setAttribute('loading', 'eager');
      copy.setAttribute('decoding', 'async');
    }
    for (const key of ['colspan', 'rowspan']) {
      const value = element.getAttribute(key);
      if (value && /^\d{1,3}$/.test(value)) copy.setAttribute(key, value);
    }
    if (tag === 'annotation') copy.setAttribute('encoding', 'application/x-tex');
    for (const declaration of (element.getAttribute('style') || '').split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const name = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (!styles.has(name) || /url|expression|[\\<>@{}]/i.test(value)) continue;
      if (name === 'position' && !['relative', 'static'].includes(value)) continue;
      if (
        name === 'display' &&
        !['block', 'inline', 'inline-block', 'table', 'table-row', 'table-cell'].includes(value)
      )
        continue;
      const style = (copy as HTMLElement).style;
      if (style) style.setProperty(name, value);
    }
    for (const child of element.childNodes) append(child, copy);
    parent.appendChild(copy);
  }
  for (const node of source.content.childNodes) append(node, fragment);
  return fragment;
}
