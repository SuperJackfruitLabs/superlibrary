import type { View } from './model';

/** What the content Worker hands the viewer bundle, in `<script id="sl-data" type="application/json">`. */
export interface ViewerData {
  view: View;
  path: string;
  name: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  /** This file's signed raw URL. */
  rawUrl: string;
  /** `<origin>/s/<token>/`: relative files of the same version resolve against it. */
  baseUrl: string;
  /** The one origin the frame may post to (plan D18). */
  host: string;
  /** Inlined for text kinds: `connect-src 'none'` means the viewer cannot fetch them. */
  text?: string;
  /** Inlined for PDF. */
  base64?: string;
  /** `/_view?source=1`: show `text` as highlighted source, whatever `view` is. */
  source?: true;
}

export const TEXT_VIEWS: ReadonlySet<View> = new Set<View>(['markdown', 'code', 'text', 'json', 'yaml', 'toml', 'csv', 'tsv', 'ipynb', 'mermaid', 'graphviz', 'svg']);

/** Kinds that have text, so `/_view?source=1` can show them: every text view, and HTML. */
export const SOURCE_VIEWS: ReadonlySet<View> = new Set<View>([...TEXT_VIEWS, 'html']);
