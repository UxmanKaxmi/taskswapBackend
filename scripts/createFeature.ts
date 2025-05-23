// scripts/createFeature.ts
import fs from "fs";
import path from "path";

const featureName = process.argv[2];

if (!featureName) {
  console.error(
    "❌ Please provide a feature name. Example: yarn create:feature notification"
  );
  process.exit(1);
}

const pascal = (s: string) => s[0].toUpperCase() + s.slice(1);
const folderPath = path.join("src", "features", featureName);

const files = [
  {
    name: `${featureName}.controller.ts`,
    content: `import { Request, Response, NextFunction } from "express";

export async function handleGet${pascal(
      featureName
    )}(req: Request, res: Response, next: NextFunction) {
  try {
    // TODO: implement
    res.status(200).json({ message: "${featureName} controller working" });
  } catch (error) {
    next(error);
  }
}
`,
  },
  {
    name: `${featureName}.service.ts`,
    content: `// ${featureName} service logic goes here
export async function get${pascal(featureName)}() {
  // TODO: implement
  return [];
}
`,
  },
  {
    name: `${featureName}.routes.ts`,
    content: `import express from "express";
import { handleGet${pascal(featureName)} } from "./${featureName}.controller";

const router = express.Router();

router.get("/", handleGet${pascal(featureName)});

export default router;
`,
  },
  {
    name: `${featureName}.types.ts`,
    content: `// Types for ${featureName}
export interface ${pascal(featureName)}DTO {
  id: string;
}
`,
  },
];

if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
  files.forEach((file) =>
    fs.writeFileSync(path.join(folderPath, file.name), file.content)
  );
  console.log(`✅ Feature folder '${featureName}' created successfully.`);
} else {
  console.log(`❌ Feature folder '${featureName}' already exists.`);
}
