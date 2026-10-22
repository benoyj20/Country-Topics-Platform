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
import * as migration_20261017_035339_check_requests from './20261017_035339_check_requests';
import * as migration_20261017_050139_linked_individuals from './20261017_050139_linked_individuals';
import * as migration_20261017_063102_profile_statements from './20261017_063102_profile_statements';
import * as migration_20261017_090000_search_topics from './20261017_090000_search_topics';
import * as migration_20261017_193831_comments from './20261017_193831_comments';
import * as migration_20261017_220610_comment_moderation from './20261017_220610_comment_moderation';
import * as migration_20261018_011503_account_deletion_feedback from './20261018_011503_account_deletion_feedback';
import * as migration_20261021_165743_drop_vector_extension from './20261021_165743_drop_vector_extension';
import * as migration_20261022_164839_topic_autosave from './20261022_164839_topic_autosave';

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
    name: '20261017_025328_snippets_and_videos',
  },
  {
    up: migration_20261017_035339_check_requests.up,
    down: migration_20261017_035339_check_requests.down,
    name: '20261017_035339_check_requests',
  },
  {
    up: migration_20261017_050139_linked_individuals.up,
    down: migration_20261017_050139_linked_individuals.down,
    name: '20261017_050139_linked_individuals',
  },
  {
    up: migration_20261017_063102_profile_statements.up,
    down: migration_20261017_063102_profile_statements.down,
    name: '20261017_063102_profile_statements',
  },
  {
    up: migration_20261017_090000_search_topics.up,
    down: migration_20261017_090000_search_topics.down,
    name: '20261017_090000_search_topics',
  },
  {
    up: migration_20261017_193831_comments.up,
    down: migration_20261017_193831_comments.down,
    name: '20261017_193831_comments',
  },
  {
    up: migration_20261017_220610_comment_moderation.up,
    down: migration_20261017_220610_comment_moderation.down,
    name: '20261017_220610_comment_moderation',
  },
  {
    up: migration_20261018_011503_account_deletion_feedback.up,
    down: migration_20261018_011503_account_deletion_feedback.down,
    name: '20261018_011503_account_deletion_feedback',
  },
  {
    up: migration_20261021_165743_drop_vector_extension.up,
    down: migration_20261021_165743_drop_vector_extension.down,
    name: '20261021_165743_drop_vector_extension',
  },
  {
    up: migration_20261022_164839_topic_autosave.up,
    down: migration_20261022_164839_topic_autosave.down,
    name: '20261022_164839_topic_autosave'
  },
];
