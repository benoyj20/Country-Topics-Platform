import * as migration_20261014_204634_initial from './20261014_204634_initial';
import * as migration_20261014_212946_auth_tables from './20261014_212946_auth_tables';
import * as migration_20261014_213100_profile_fields from './20261014_213100_profile_fields';
import * as migration_20261014_213110_remove_password_login from './20261014_213110_remove_password_login';
import * as migration_20261014_213300_better_auth_tables from './20261014_213300_better_auth_tables';

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
    name: '20261014_213300_better_auth_tables'
  },
];
