const actionButton = document.querySelector("#actionButton");

if (actionButton) {
  actionButton.addEventListener("click", () => {
    actionButton.textContent = "Clicked!";
  });
}

function scrollToSection(sectionId) {
  const targetSection = document.getElementById(sectionId);

  if (!targetSection) {
    return;
  }

  targetSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

window.scrollToSection = scrollToSection;
