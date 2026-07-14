import { configureLogger } from '@cuewise/shared';

// The engine warn-logs expected paths (quarantine, unknown collections) through
// the shared logger — silence it so real failures stand out in test output.
configureLogger({ enabled: false });
