'use strict';

require('should');
const createlogger = require('../src/tools/create-logger');
const querystring = require('querystring');
const { Headers } = require('node-fetch');
const {
  replaceHeaders,
} = require('../src/http-middlewares/after/middleware-utils');

const { FAKE_LOG_URL, mockLogServer } = require('./tools/mocky');

describe('logger', () => {
  const options = {
    endpoint: `${FAKE_LOG_URL}/input`,
    token: 'fake-token',
  };

  beforeEach(() => {
    // This fake log server echoes the input request in the response
    mockLogServer();
  });

  // httpbin/post echoes all the input body and headers in the response

  it('should log to graylog', async () => {
    const event = {};
    const logger = createlogger(event, options);
    const data = { key: 'val' };

    logger('test', data);
    const response = await logger.end();

    response.status.should.eql(200);

    response.content.contentType.should.containEql('application/x-ndjson');
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      { message: 'test', data: { log_type: 'console', key: 'val' } },
    ]);
  });

  it('should include bundle meta', async () => {
    const logExtra = {
      'meta-key': 'meta-value',
    };

    const logger = createlogger({ logExtra }, options);

    logger('test');
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: 'test',
        data: { log_type: 'console', 'meta-key': 'meta-value' },
      },
    ]);
  });

  it('should replace auth data', async () => {
    const bundle = {
      authData: {
        password: 'secret',
        key: 'notell',
      },
    };
    const logger = createlogger({ bundle }, options);

    const data = bundle.authData;

    logger('test', data);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: 'test',
        data: {
          password: ':censored:6:a5023f748d:',
          log_type: 'console',
          key: ':censored:6:8f63f9ff57:',
        },
      },
    ]);
  });

  it('should censor auth headers', async () => {
    const bundle = {
      authData: {
        key: 'verysecret',
      },
      headers: {
        request_headers: {
          authorization: 'basic dmVyeXNlY3JldA==',
        },
        response_headers: {
          Authorization: 'basic OnZlcnlzZWNyZXRwbGVhc2U=',
        },
      },
    };
    const logger = createlogger({ bundle }, options);

    logger('123 from google.com', bundle.headers);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: '123 from google.com',
        data: {
          log_type: 'console',
          request_headers: 'authorization: basic :censored:10:d98440830f:',
          response_headers: 'Authorization: :censored:30:f914b1b0d1:',
        },
      },
    ]);
  });

  it('should work with header class', async () => {
    const bundle = {
      authData: {
        key: 'verysecret',
      },
      headers: {
        request_headers: replaceHeaders({
          headers: new Headers({
            authorization: 'basic dmVyeXNlY3JldA==',
          }),
        }).headers,
        response_headers: replaceHeaders({
          headers: new Headers({
            Authorization: 'basic OnZlcnlzZWNyZXRwbGVhc2U=',
          }),
        }).headers,
      },
    };
    const logger = createlogger({ bundle }, options);

    logger('123 from url google.com', bundle.headers);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: '123 from url google.com',
        data: {
          log_type: 'console',
          request_headers: 'authorization: basic :censored:10:d98440830f:',
          response_headers: 'authorization: :censored:30:f914b1b0d1:',
        },
      },
    ]);
  });

  it('should refuse to log headers that arrived as strings', async () => {
    const bundle = {
      authData: {
        key: 'verysecret',
      },
      headers: {
        request_headers: 'authorization: basic dmVyeXNlY3JldA==',
        response_headers: 'authorization: basic dmVyeXNlY3JldA==',
      },
    };
    const logger = createlogger({ bundle }, options);

    logger('123 from url google.com', bundle.headers);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: '123 from url google.com',
        data: {
          log_type: 'console',
          request_headers: 'ERR - refusing to log possibly uncensored headers',
          response_headers: 'ERR - refusing to log possibly uncensored headers',
        },
      },
    ]);
  });

  it('should replace sensitive data inside strings', async () => {
    const bundle = {
      authData: {
        password: 'secret',
        key: 'notell',
        api_key: 'pa$$word',
      },
    };
    const logger = createlogger({ bundle }, options);

    const data = {
      response_content: `{
        "something": "secret",
        "somethingElse": "notell",
      }`,
      request_url: `https://test.com/?${querystring.stringify({
        api_key: 'pa$$word',
      })}`,
    };

    logger('test', data);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: 'test',
        data: {
          log_type: 'console',
          response_content: `{
        "something": ":censored:6:a5023f748d:",
        "somethingElse": ":censored:6:8f63f9ff57:",
      }`,
          request_url: 'https://test.com/?api_key=:censored:8:f274744218:',
        },
      },
    ]);
  });

  it('should replace sensitive data inside response', async () => {
    const bundle = {
      authData: {
        refresh_token: 'whatever',
      },
    };
    const logger = createlogger({ bundle }, options);

    const data = {
      response_json: {
        access_token: 'super_secret',
        PASSWORD: 'top_secret',
        name: 'not so secret',
      },
      response_content: `{
        "access_token": "super_secret",
        "PASSWORD": "top_secret",
        "name": "not so secret"
      }`,
    };

    logger('test', data);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: 'test',
        data: {
          response_json: {
            access_token: ':censored:12:8e4a58294b:',
            PASSWORD: ':censored:10:b0c55acfea:',
            name: 'not so secret',
          },
          response_content: `{
        "access_token": ":censored:12:8e4a58294b:",
        "PASSWORD": ":censored:10:b0c55acfea:",
        "name": "not so secret"
      }`,
          log_type: 'console',
        },
      },
    ]);
  });

  it('should replace sensitive data that is not a string', async () => {
    const bundle = {
      authData: {
        numerical_token: 314159265,
      },
    };
    const logger = createlogger({ bundle }, options);

    const data = {
      response_json: {
        hello: 314159265,
      },
      response_content: `{
        "hello": 314159265
      }`,
    };

    logger('test', data);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: 'test',
        data: {
          response_json: {
            hello: ':censored:9:9cb84e8ccc:',
          },
          response_content: `{
        "hello": :censored:9:9cb84e8ccc:
      }`,
          log_type: 'console',
        },
      },
    ]);
  });

  // this test fails because the function that creates the sensitive bank doesn't
  // recurse to find all sensitive values
  it.skip('should replace sensitive data that nested', async () => {
    const bundle = {
      authData: {
        nested: { secret: 8675309 },
      },
    };
    const logger = createlogger({ bundle }, options);

    const data = {
      response_json: {
        nested: { secret: 8675309 },
      },
      response_content: `{
        nested: { secret: 8675309 }
      }`,
    };

    logger('test', data);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: 'test',
        data: {
          response_json: {
            nested: {
              secret: ':censored:9:9cb84e8ccc:',
            },
          },
          response_content: `{
        nested: { secret: :censored:9:9cb84e8ccc: }
      }`,
          log_type: 'console',
        },
      },
    ]);
  });

  it('should not replace safe log keys', async () => {
    const bundle = {
      authData: {
        password: 'secret',
        key: '123456789',
      },
    };
    const logExtra = {
      customuser_id: '123456789', // This is a safe log key
    };
    const logger = createlogger({ bundle, logExtra }, options);

    const data = bundle.authData;

    logger('test', data);
    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      {
        message: 'test',
        data: {
          password: ':censored:6:a5023f748d:',
          log_type: 'console',
          key: ':censored:9:699f352527:',
          customuser_id: logExtra.customuser_id,
        },
      },
    ]);
  });

  it('should send multiple logs in a request', async () => {
    const logger = createlogger({}, options);

    logger('hello 1', { customuser_id: 1 });
    logger('hello 2', { customuser_id: 2 });
    logger('hello 3', { customuser_id: 3 });

    const response = await logger.end();
    response.status.should.eql(200);
    response.content.token.should.eql(options.token);
    response.content.logs.should.deepEqual([
      { message: 'hello 1', data: { log_type: 'console', customuser_id: 1 } },
      { message: 'hello 2', data: { log_type: 'console', customuser_id: 2 } },
      { message: 'hello 3', data: { log_type: 'console', customuser_id: 3 } },
    ]);
  });
});
