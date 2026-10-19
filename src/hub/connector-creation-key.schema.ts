import { z } from "zod";

/** Both connector creation routes require exactly one ASCII 1..191 command key. */
export const connectorCreationKeySchema = z.string().regex(/^[\x21-\x7e]{1,191}(?![\s\S])/u);
