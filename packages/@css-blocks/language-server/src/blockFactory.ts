import { BlockFactory } from "@css-blocks/core/dist/src";
import { postcss } from "opticss";

import { blockConfig } from "./blockConfig";

export const blockFactory = new BlockFactory(blockConfig, postcss);
