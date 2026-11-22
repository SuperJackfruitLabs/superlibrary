import { createBundle, validatorFor } from '@superjackfruitlabs/treaty-contracts';
import recordSchema from '@superjackfruitlabs/treaty-event-schemas/superpipeline/record.v1.json';

/** SuperPipeline's record event body, as treaty's record.v1 holds it. */
export interface RecordBody {
  event: string;
  boardId: string;
  seq: number;
  ts: string;
  cardIds: string[];
}

const RECORD_SCHEMA = 'schemas/superpipeline/record.v1.json';

/** The record events, read from treaty's schema: a push config may subscribe to nothing else. */
export const RECORD_EVENT_NAMES: readonly string[] = recordSchema.properties.event.enum;

const validRecord = validatorFor(createBundle({ [RECORD_SCHEMA]: recordSchema }), RECORD_SCHEMA);

/** True when `body` is a record event by treaty's record.v1. */
export function isRecordBody(body: unknown): body is RecordBody {
  return validRecord(body).valid;
}
