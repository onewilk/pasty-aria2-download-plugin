import { createApp } from "vue";
import { pasty } from "@pasty/plugin-sdk/ui";
import { autoFit, patchConsole, patchTextInputState } from "@pasty/plugin-sdk/dom";
import App from "./app.vue";
import "../../ui/shared/base.css";

patchConsole();
patchTextInputState();

const app = createApp(App);
app.mount("#app");

void pasty.window.autoFit().catch(() => {
  // Local browser previews do not provide the Pasty host bridge.
});

autoFit({ min: 140, max: 480, target: document.getElementById("app") });
