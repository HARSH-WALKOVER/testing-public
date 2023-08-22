'use strict';

const makeSchema = require('../utils/makeSchema');
const { SKIP_KEY } = require('../constants');

const DynamicFieldsSchema = require('./DynamicFieldsSchema');
const FunctionSchema = require('./FunctionSchema');
const RequestSchema = require('./RequestSchema');
const ResultsSchema = require('./ResultsSchema');
const KeySchema = require('./KeySchema');

module.exports = makeSchema(
  {
    id: '/BasicOperationSchema',
    description:
      'Represents the fundamental mechanics of triggers, searches, or creates.',
    type: 'object',
    required: ['perform'],
    properties: {
      resource: {
        description:
          'Optionally reference and extends a resource. Allows Zapier to automatically tie together samples, lists and hooks, greatly improving the UX. EG: if you had another trigger reusing a resource but filtering the results.',
        $ref: KeySchema.id,
      },
      perform: {
        description:
          "How will Zapier get the data? This can be a function like `(z) => [{id: 123}]` or a request like `{url: 'http...'}`.",
        oneOf: [{ $ref: RequestSchema.id }, { $ref: FunctionSchema.id }],
      },
      inputFields: {
        description:
          'What should the form a user sees and configures look like?',
        $ref: DynamicFieldsSchema.id,
      },
      outputFields: {
        description:
          'What fields of data will this return? Will use resource outputFields if missing, will also use sample if available.',
        $ref: DynamicFieldsSchema.id,
      },
      sample: {
        description:
          'What does a sample of data look like? Will use resource sample if missing. Requirement waived if `display.hidden` is true or if this belongs to a resource that has a top-level sample',
        type: 'object',
        // TODO: require id, ID, Id property?
        minProperties: 1,
        docAnnotation: {
          required: {
            type: 'replace', // replace or append
            value: '**yes** (with exceptions, see description)',
          },
        },
      },
      lock: {
        description:
          '**INTERNAL USE ONLY**. Zapier uses this config for internal operation locking.',
        type: 'object',
        required: ['key'],
        properties: {
          key: {
            description:
              'The key to use for locking. This should be unique to the operation.',
            type: 'string',
            minLength: 1,
          },
          scope: {
            description: `The level at which an app's access is restricted to. By default, locks are scoped to the app. That is, all users of the app will share the same locks. If you want to restrict serial access to a specific user, auth, or account, you can set the scope to one or more of the following: 'user' - Locks based on user ids.  'auth' - Locks based on unique auth ids. 'account' - Locks for all users under a single account. You may also combine scopes.`,
            type: 'array',
            items: {
              enum: ['user', 'auth', 'account'],
              type: 'string',
            },
          },
          timeout: {
            description:
              'The number of seconds to hold the lock before timing out. If not provided, will use the default set by the app.',
            type: 'integer',
          },
        },
      },
    },
    examples: [
      {
        perform: { require: 'some/path/to/file.js' },
        sample: { id: 42, name: 'Hooli' },
      },
    ],
    antiExamples: [
      {
        [SKIP_KEY]: true, // Cannot validate that sample is only required if display isn't true / top-level resource doesn't have sample
        example: {
          perform: { require: 'some/path/to/file.js' },
        },
        reason:
          'Missing required key: sample. Note - This is only invalid if `display` is not explicitly set to true and if it does not belong to a resource that has a sample.',
      },
    ],
    additionalProperties: false,
  },
  [DynamicFieldsSchema, FunctionSchema, KeySchema, RequestSchema, ResultsSchema]
);
