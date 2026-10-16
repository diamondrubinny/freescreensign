// Setup page of the desktop player (bundled, no remote code).
const form = document.getElementById('setup');
const input = document.getElementById('server');
const error = document.getElementById('error');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  error.textContent = '';
  input.removeAttribute('aria-invalid');
  window.RubinnySetup.setServer(input.value).then(
    (result) => {
      if (!result.ok) {
        input.setAttribute('aria-invalid', 'true');
        error.textContent =
          'כתובת לא תקינה. יש להזין כתובת https מלאה. · Invalid address: enter a full https address.';
        input.focus();
      }
    },
    () => {
      error.textContent = 'השמירה נכשלה. · Saving failed.';
    },
  );
});
input.focus();
