export interface ComposeVolumeLong {
  type?: string;
  source?: string;
  target?: string;
}

export type ComposeVolumeEntry = string | ComposeVolumeLong;

export interface ComposeService {
  image?: string;
  build?: unknown;
  privileged?: boolean;
  network_mode?: string;
  cap_add?: string[];
  volumes?: ComposeVolumeEntry[];
  environment?: Record<string, string> | string[];
  networks?: string[] | Record<string, unknown>;
  ports?: unknown;
  [key: string]: unknown;
}

export interface ComposeDocument {
  version?: string;
  services?: Record<string, ComposeService>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
  [key: string]: unknown;
}
