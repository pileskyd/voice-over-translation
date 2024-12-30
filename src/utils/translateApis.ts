import type { ClientType, BaseProviderType } from "@toil/translate/types";

import {
  foswlyTranslateUrl,
  detectRustServerUrl,
  defaultDetectService,
  defaultTranslationService,
} from "../config/config.js";
import { votStorage } from "./storage";
import { GM_fetch } from "./utils.js";

type FOSWLYErrorResponse = {
  error: string;
};

/**
 * Limit: 10k symbols for yandex, 50k for msedge
 */
const FOSWLYTranslateAPI = new (class {
  isFOSWLYError<T extends object>(
    data: T | FOSWLYErrorResponse,
  ): data is FOSWLYErrorResponse {
    return Object.hasOwn(data, "error");
  }

  async request<T extends object>(
    path: string,
    opts: Record<string, unknown> = {},
  ) {
    try {
      const res = await GM_fetch(`${foswlyTranslateUrl}${path}`, {
        timeout: 3000,
        ...opts,
      });

      const data = (await res.json()) as T | FOSWLYErrorResponse;
      if (this.isFOSWLYError<T>(data)) {
        throw data.error;
      }

      return data;
    } catch (err) {
      console.error(
        `[VOT] Failed to get data from FOSWLY Translate API, because ${
          (err as Error).message
        }`,
      );
      return undefined;
    }
  }

  async translate(
    text: string,
    lang: string,
    service: keyof typeof ClientType.TranslationService,
  ) {
    const result = await this.request<BaseProviderType.TranslationResponse>(
      `/translate?${new URLSearchParams({
        text,
        lang,
        service,
      })}`,
    );

    return result ? result.translations[0] : text;
  }

  async detect(
    text: string,
    service: keyof typeof ClientType.TranslationService,
  ) {
    const result = await this.request<BaseProviderType.DetectResponse>(
      `/detect?${new URLSearchParams({
        text,
        service,
      })}`,
    );

    return result ? result.lang : "en";
  }
})();

const RustServerAPI = {
  async detect(text: string) {
    try {
      const response = await GM_fetch(detectRustServerUrl, {
        method: "POST",
        body: text,
        timeout: 3000,
      });

      return await response.text();
    } catch (error) {
      console.error(
        `[VOT] Error getting lang from text, because ${
          (error as Error).message
        }`,
      );
      return "en";
    }
  },
};

async function translate(text: string, fromLang = "", toLang = "ru") {
  const service = await votStorage.get(
    "translationService",
    defaultTranslationService,
  );
  switch (service) {
    case "yandexbrowser":
    case "msedge": {
      const langPair = fromLang && toLang ? `${fromLang}-${toLang}` : toLang;
      return await FOSWLYTranslateAPI.translate(text, langPair, service);
    }
    default:
      return text;
  }
}

async function detect(text: string) {
  const service = await votStorage.get("detectService", defaultDetectService);
  switch (service) {
    case "yandexbrowser":
    case "msedge":
      return await FOSWLYTranslateAPI.detect(text, service);
    case "rust-server":
      return await RustServerAPI.detect(text);
    default:
      return "en";
  }
}

const foswlyServices = ["yandexbrowser", "msedge"];
const detectServices = [...foswlyServices, "rust-server"];

export {
  translate,
  detect,
  foswlyServices as translateServices,
  detectServices,
};
