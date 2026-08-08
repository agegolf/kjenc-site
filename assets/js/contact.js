document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    let hasError = false;
    const fields = form.querySelectorAll(".field[data-required='true']");

    fields.forEach((field) => {
      const input = field.querySelector("input, select, textarea");
      const isEmpty = !input.value || !input.value.trim();

      field.classList.toggle("field-invalid", isEmpty);
      if (isEmpty) hasError = true;
    });

    if (hasError) return;

    alert("문의가 접수되었습니다. 빠르게 회신드리겠습니다.");
    form.reset();
    fields.forEach((field) => field.classList.remove("field-invalid"));
  });
});
