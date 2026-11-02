// Deliberately local-only: no remote base URL or production credentials accepted.
module.exports = {
  webURL: 'http://127.0.0.1:3100',
  apiURL: 'http://127.0.0.1:8100',
  authSecret: 'mathbot-local-e2e-auth-secret-never-use-in-production',
  proxySecret: 'mathbot-local-e2e-proxy-secret-never-use-in-production',
  teacherEmail: 'teacher@e2e.invalid',
  adminEmail: 'admin@e2e.invalid',
  learnerEmail: 'learner@e2e.invalid',
  otherLearnerEmail: 'other-learner@e2e.invalid',
};
