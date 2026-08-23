export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  APP_NAME: string;
  PUBLIC_BASE_URL: string;
  DODO_ENVIRONMENT?: string;
  DODO_LIFETIME_PRODUCT_ID?: string;
  DODO_STARTER_PRODUCT_ID?: string;
  DODO_STARTER_ANNUAL_PRODUCT_ID?: string;
  DODO_AGENCY_PRODUCT_ID?: string;
  DODO_AGENCY_ANNUAL_PRODUCT_ID?: string;
  DODO_PAYMENTS_API_KEY?: string;
  /** Promo code held at Dodo, pre-applied to the lifetime cart. */
  LIFETIME_DISCOUNT_CODE?: string;
  LIFETIME_DISCOUNT_USD?: string;
  LIFETIME_DISCOUNT_INR?: string;
  DODO_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  role: string;
  unlimited: number;
  suspended: number;
  lead_emails: number;
  subscription_id: string;
  plan_renews_at: number;
  created_at: number;
}

export type SourceType = 'youtube' | 'vimeo' | 'mp4' | 'hls';

export interface PlayerConfig {
  skin: string;
  accent: string;
  background: string;
  controls: {
    playPause: boolean;
    progress: boolean;
    volume: boolean;
    time: boolean;
    speed: boolean;
    quality: boolean;
    captions: boolean;
    chapters: boolean;
    pip: boolean;
    fullscreen: boolean;
    keyboard: boolean;
    share: boolean;
  };
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  startAt: number;
  resume: boolean;
  speeds: number[];
  logoUrl: string;
  logoLink: string;
  logoPosition: string;
  title: boolean;
  bigPlayButton: boolean;
  sourceCaptions: boolean;
  sticky: boolean;
  borderRadius: number;
  related: boolean;
}

export interface Playlist {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string;
  layout: string;
  autoplay_next: number;
  visibility: 'public' | 'unlisted' | 'password';
  password_hash: string;
  password_salt: string;
  created_at: number;
}

export interface Video {
  id: string;
  user_id: string;
  project_id: string | null;
  slug: string;
  title: string;
  description: string;
  source_type: SourceType;
  source_ref: string;
  duration: number;
  thumbnail_url: string;
  thumbnail_url_b: string;
  captions_url: string;
  transcript: string;
  player_config: string;
  visibility: 'public' | 'unlisted' | 'password';
  password_hash: string;
  password_salt: string;
  allowed_domains: string;
  created_at: number;
  updated_at: number;
}

export interface Chapter {
  id: string;
  video_id: string;
  start_seconds: number;
  title: string;
}

export interface Cta {
  id: string;
  video_id: string;
  kind: 'overlay' | 'banner' | 'endscreen' | 'gate';
  start_seconds: number;
  end_seconds: number;
  headline: string;
  body: string;
  button_text: string;
  button_url: string;
  fields: string;
  skippable: number;
  position: string;
}
