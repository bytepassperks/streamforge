/**
 * Seeds a D1 database with a demo account and a few videos so the dashboard has
 * something to show. Usage: npm run seed:local (add --remote for deployed D1;
 * set SEED_EMAIL / SEED_PASSWORD to choose the credentials).
 */
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const EMAIL = process.env.SEED_EMAIL || 'demo@videokr.test';
const PASSWORD = process.env.SEED_PASSWORD || 'videokr123';
const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

function id(prefix) {
  const bytes = randomBytes(16);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

/** Mirrors src/lib/auth.ts: PBKDF2-SHA256, 100k iterations, hex output. */
function hash(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const nowSeconds = Math.floor(Date.now() / 1000);

const userId = id('usr');
const salt = randomBytes(16).toString('hex');
const projectId = id('prj');

const playerConfig = JSON.stringify({
  skin: 'forge-dark',
  accent: '#4f7cff',
  background: '#0b0d12',
  controls: {
    playPause: true,
    progress: true,
    volume: true,
    time: true,
    speed: true,
    quality: true,
    captions: true,
    chapters: true,
    pip: true,
    fullscreen: true,
    keyboard: true,
  },
  autoplay: false,
  muted: false,
  loop: false,
  startAt: 0,
  resume: true,
  speeds: [0.5, 0.75, 1, 1.25, 1.5, 2],
  logoUrl: '',
  logoLink: '',
  logoPosition: 'top-right',
  title: true,
  bigPlayButton: true,
  sticky: false,
  borderRadius: 12,
});

const videos = [
  {
    id: id('vid'),
    slug: 'videokr-product-tour',
    title: 'Videokr product tour',
    description: 'A walkthrough of the player, embeds and analytics.',
    source_type: 'youtube',
    source_ref: 'c65tLZVgkcY',
    thumbnail: 'https://i.ytimg.com/vi/c65tLZVgkcY/hqdefault.jpg',
  },
  {
    id: id('vid'),
    slug: 'open-media-sample',
    title: 'Own-media sample (MP4)',
    description: 'A creative-commons MP4 played through the Videokr player (CORS + range friendly).',
    source_type: 'mp4',
    source_ref: 'https://mdn.github.io/shared-assets/videos/flower.mp4',
    thumbnail: '',
  },
];

const statements = [
  `DELETE FROM users WHERE email = ${q(EMAIL)};`,
  `INSERT INTO users (id, email, name, password_hash, password_salt, plan, created_at)
     VALUES (${q(userId)}, ${q(EMAIL)}, ${q('Demo Studio')}, ${q(hash(PASSWORD, salt))}, ${q(salt)}, 'free', ${nowSeconds});`,
  `INSERT INTO projects (id, user_id, name, created_at)
     VALUES (${q(projectId)}, ${q(userId)}, ${q('Launch campaign')}, ${nowSeconds});`,
];

for (const video of videos) {
  statements.push(
    `INSERT INTO videos (id, user_id, project_id, slug, title, description, source_type, source_ref,
                         thumbnail_url, player_config, created_at, updated_at)
       VALUES (${q(video.id)}, ${q(userId)}, ${q(projectId)}, ${q(video.slug)}, ${q(video.title)},
               ${q(video.description)}, ${q(video.source_type)}, ${q(video.source_ref)}, ${q(video.thumbnail)},
               ${q(playerConfig)}, ${nowSeconds}, ${nowSeconds});`,
  );
}

statements.push(
  `INSERT INTO chapters (id, video_id, start_seconds, title)
     VALUES (${q(id('chp'))}, ${q(videos[0].id)}, 0, ${q('Introduction')}),
            (${q(id('chp'))}, ${q(videos[0].id)}, 25, ${q('Player customisation')}),
            (${q(id('chp'))}, ${q(videos[0].id)}, 60, ${q('Analytics and leads')});`,
  `INSERT INTO ctas (id, video_id, kind, start_seconds, end_seconds, headline, body, button_text, button_url,
                     fields, skippable, position)
     VALUES (${q(id('cta'))}, ${q(videos[0].id)}, 'overlay', 5, 20, ${q('Like what you see?')},
             ${q('Spin up your own Videokr workspace in a minute.')}, ${q('Start free')},
             ${q('https://github.com/bytepassperks/streamforge')}, 'email', 1, 'bottom-right');`,
);

const target = process.argv.includes('--remote') ? '--remote' : '--local';
const sql = statements.join('\n');
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'streamforge', target, '--yes', '--command', sql],
  { stdio: 'inherit' },
);

console.log(`\nSeeded ${target === '--remote' ? 'remote' : 'local'} database.\n  email:    ${EMAIL}\n`);
