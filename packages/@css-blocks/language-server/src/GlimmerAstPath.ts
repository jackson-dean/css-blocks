import { AST } from "@glimmer/syntax";
import { Position, SourceLocation } from "estree";

import { containsPosition } from "./util/estTreeUtils";

export class GlimmerAstPath {
  static toPosition(ast: AST.Template, position: Position): GlimmerAstPath | null {
    let path = _findFocusPath(ast, position);

    if (path) {
      return new GlimmerAstPath(path);
    }

    return null;
  }

  private constructor(private readonly path: AST.Node[], private readonly index: number = path.length - 1) {}

  get node(): AST.Node {
    return this.path[this.index];
  }

  get parent(): AST.Node | undefined {
    return this.path[this.index - 1];
  }

  get parentPath(): GlimmerAstPath | undefined {
    return new GlimmerAstPath(this.path, this.index - 1);
  }
}

function _findFocusPath(node: AST.Template, position: Position, seen = new Set()): AST.Node[] {
  seen.add(node);

  let path: AST.Node[] = [];
  let range: SourceLocation = node.loc;
  if (range) {
    if (containsPosition(range, position)) {
      path.push(node);
    } else {
      return [];
    }
  }

  for (let key in node) {
    if (!node.hasOwnProperty(key)) {
      continue;
    }

    let value = node[key];
    if (!value || typeof value !== "object" || seen.has(value)) {
      continue;
    }

    let childPath = _findFocusPath(value, position, seen);
    if (childPath.length > 0) {
      path = path.concat(childPath);
      break;
    }
  }

  return path;
}
