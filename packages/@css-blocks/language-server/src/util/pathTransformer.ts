import * as path from "path";
import { URI } from "vscode-uri";

import { isBlockFile } from "./blockUtils";
import { isTemplateFile } from "./hbsUtils";

interface TransformedPaths {
  templateFsPath?: string;
  templateUri?: string;
  blockFsPath?: string;
  blockUri?: string;
}

/**
 * Given a uri, return a map of corresponding block and template file system
 * and uri paths.
 */
export function transformPathsFromUri(uri: string): TransformedPaths {
  let fsPath = URI.parse(uri).fsPath;

  if (isTemplateFile(uri)) {
    let blockFsPath = fsPath
      .replace(/.hbs$/, ".block.css")
      .replace(
        new RegExp(`${path.sep}templates${path.sep}`),
        `${path.sep}styles${path.sep}`,
      );

    return {
      blockFsPath,
      blockUri: URI.file(blockFsPath).toString(),
      templateFsPath: fsPath,
      templateUri: uri,
    };
  }

  if (isBlockFile(uri)) {
    let templateFsPath = fsPath
      .replace(/\.block\.css$/, ".hbs")
      .replace(
        new RegExp(`${path.sep}styles${path.sep}`),
        `${path.sep}templates${path.sep}`,
      );

    return {
      blockFsPath: fsPath,
      blockUri: uri,
      templateFsPath,
      templateUri: URI.file(templateFsPath).toString(),
    };
  }

  return {};
}
