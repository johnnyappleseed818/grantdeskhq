import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "../styles.css";

const redirectedRoute = sessionStorage.getItem("grantdesk:redirect");
if (redirectedRoute) {
  sessionStorage.removeItem("grantdesk:redirect");
  window.history.replaceState(null, "", redirectedRoute);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
