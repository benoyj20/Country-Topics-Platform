import * as migration_20261014_204634_initial from './20261014_204634_initial';
import * as migration_20261014_212946_auth_tables from './20261014_212946_auth_tables';
import * as migration_20261014_213100_profile_fields from './20261014_213100_profile_fields';
import * as migration_20261014_213110_remove_password_login from './20261014_213110_remove_password_login';
import * as migration_20261014_213300_better_auth_tables from './20261014_213300_better_auth_tables';
import * as migration_20261014_223205_content_collections from './20261014_223205_content_collections';
import * as migration_20261014_223300_name_similarity_indexes from './20261014_223300_name_similarity_indexes';
import * as migration_20261014_223400_seed_countries from './20261014_223400_seed_countries';
import * as migration_20261014_234019_topics from './20261014_234019_topics';
import * as migration_20261015_033825_evidence_and_references from './20261015_033825_evidence_and_references';
import * as migration_20261017_025328_snippets_and_videos from './20261017_025328_snippets_and_videos';

export const migrations = [
  {
    up: migration_20261014_204634_initial.up,
    down: migration_20261014_204634_initial.down,
    name: '20261014_204634_initial',
  },
  {
    up: migration_20261014_212946_auth_tables.up,
    down: migration_20261014_212946_auth_tables.down,
    name: '20261014_212946_auth_tables',
  },
  {
    up: migration_20261014_213100_profile_fields.up,
    down: migration_20261014_213100_profile_fields.down,
    name: '20261014_213100_profile_fields',
  },
  {
    up: migration_20261014_213110_remove_password_login.up,
    down: migration_20261014_213110_remove_password_login.down,
    name: '20261014_213110_remove_password_login',
  },
  {
    up: migration_20261014_213300_better_auth_tables.up,
    down: migration_20261014_213300_better_auth_tables.down,
    name: '20261014_213300_better_auth_tables',
  },
  {
    up: migration_20261014_223205_content_collections.up,
    down: migration_20261014_223205_content_collections.down,
    name: '20261014_223205_content_collections',
  },
  {
    up: migration_20261014_223300_name_similarity_indexes.up,
    down: migration_20261014_223300_name_similarity_indexes.down,
    name: '20261014_223300_name_similarity_indexes',
  },
  {
    up: migration_20261014_223400_seed_countries.up,
    down: migration_20261014_223400_seed_countries.down,
    name: '20261014_223400_seed_countries',
  },
  {
    up: migration_20261014_234019_topics.up,
    down: migration_20261014_234019_topics.down,
    name: '20261014_234019_topics',
  },
  {
    up: migration_20261015_033825_evidence_and_references.up,
    down: migration_20261015_033825_evidence_and_references.down,
    name: '20261015_033825_evidence_and_references',
  },
  {
    up: migration_20261017_025328_snippets_and_videos.up,
    down: migration_20261017_025328_snippets_and_videos.down,
    name: '20261017_025328_snippets_and_videos'
  },
];
