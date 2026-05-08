const actionButton = document.querySelector("#actionButton");

if (actionButton) {
  actionButton.addEventListener("click", () => {
    actionButton.textContent = "Clicked!";
  });
}
