import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';

export function renderMath(element) {
  renderMathInElement(element, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true },
    ],
    throwOnError: false,
    trust: false,
  });
}
