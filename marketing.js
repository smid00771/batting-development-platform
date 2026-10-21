// These product examples are illustrations; no club data or account requests are made.
document.querySelectorAll('[data-product-example]').forEach(example => {
  const buttons = [...example.querySelectorAll('[data-example]')];
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(candidate => {
      const selected = candidate === button;
      candidate.setAttribute('aria-pressed', String(selected));
      document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
    });
  }));
});
