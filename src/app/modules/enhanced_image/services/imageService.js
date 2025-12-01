
import { imagen3 } from "../utils/imagegen2.5.service.js";
import { imagegen_4 } from "../utils/imagegen4.service.js";
import { routeImageGenRequest } from "../utils/intentClassifier.js";
import path from "path";

export class ImageGenerationService {
  constructor(apiKey, imagesDir) {
    this.apiKey = apiKey;
    this.imagesDir = imagesDir;
  }

  async generateImage(prompt, filename) {
    const result = await routeImageGenRequest(prompt, { apiKey: this.apiKey });

    const filepath = path.join(this.imagesDir, filename);
    let publicUrl;

    if (result.service === "imagen4") {
      publicUrl = await imagegen_4(prompt, filepath);
    } else if (result.service === "gemini2.5flash") {
      publicUrl = await imagen3(prompt, null, filename);
    }

    return {
      filename,
      url: publicUrl,
      service: result.service,
      reasoning: result.reasoning,
      confidence: result.confidence,
    };
  }
}
