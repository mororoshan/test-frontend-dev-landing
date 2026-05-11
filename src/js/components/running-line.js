const runningLineSections = document.querySelectorAll("#running-line");

if (runningLineSections.length > 0) {
  fetch("./templates/running-line.html")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load running line template");
      }
      return response.text();
    })
    .then((templateHtml) => {
      runningLineSections.forEach((section) => {
        section.innerHTML = templateHtml;
      });
    })
    .catch((error) => {
      console.error(error);
    });
}
