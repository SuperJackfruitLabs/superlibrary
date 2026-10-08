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
}

export const TEXT_VIEWS: ReadonlySet<View> = new Set<View>(['markdown', 'code', 'text', 'json', 'yaml', 'toml', 'csv', 'tsv', 'ipynb', 'mermaid', 'graphviz', 'svg']);
