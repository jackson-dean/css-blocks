import { BlockParser } from "@css-blocks/core/dist/src/BlockParser/BlockParser";

import { blockConfig } from "./blockConfig";
import { blockFactory } from "./blockFactory";

export const blockParser = new BlockParser(blockConfig, blockFactory);
