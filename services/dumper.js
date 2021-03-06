const P = require('bluebird');
const fs = require('fs');
const _ = require('lodash');
const mkdirpSync = require('mkdirp');
const KeyGenerator = require('./key-generator');

const mkdirp = P.promisify(mkdirpSync);

function Dumper(project, config) {
  const path = `${process.cwd()}/${config.appName}`;
  const binPath = `${path}/bin`;
  const routesPath = `${path}/routes`;
  const forestPath = `${path}/forest`;
  const publicPath = `${path}/public`;
  const modelsPath = `${path}/models`;
  const schemasPath = `${path}/graphql`;

  function isUnderscored(fields) {
    let underscored = false;

    fields.forEach((f) => {
      if (f.name.includes('_')) { underscored = true; }
    });

    return underscored;
  }

  function hasTimestamps(fields) {
    let hasCreatedAt = false;
    let hasUpdatedAt = false;

    fields.forEach((f) => {
      if (_.camelCase(f.name) === 'createdAt') {
        hasCreatedAt = true;
      }

      if (_.camelCase(f.name) === 'updatedAt') {
        hasUpdatedAt = true;
      }
    });

    return hasCreatedAt && hasUpdatedAt;
  }

  function copyTemplate(from, to) {
    const newFrom = `${__dirname}/../templates/app/${from}`;
    fs.writeFileSync(to, fs.readFileSync(newFrom, 'utf-8'));
  }

  function writePackageJson(pathDest) {
    const dependencies = {
      express: '~4.16.3',
      'express-jwt': '~5.3.1',
      'express-cors': 'git://github.com/ForestAdmin/express-cors',
      'body-parser': '~1.18.3',
      'cookie-parser': '~1.4.3',
      debug: '~4.0.1',
      morgan: '~1.9.1',
      'serve-favicon': '~2.5.0',
      dotenv: '~6.1.0',
      chalk: '~1.1.3',
      sequelize: '4.8.0',
      'forest-express-sequelize': 'latest',
      'apollo-server-express': '^2.4.8',
      'apollo-link-http': '^1.5.14',
      graphql: '^14.1.1',
      'graphql-resolvers': '^0.3.2',
      'graphql-tools': '^4.0.4',
      'graphql-iso-date': '^3.6.1',
      'graphql-type-json': '^0.2.4',
      'graphql-stitcher': '0.0.2-beta.2',
    };

    if (config.dbDialect === 'postgres') {
      dependencies.pg = '~6.1.0';
    } else if (config.dbDialect === 'mysql') {
      dependencies.mysql2 = '~1.4.2';
    } else if (config.dbDialect === 'mssql') {
      dependencies.tedious = '^1.14.0';
    } else if (config.dbDialect === 'sqlite') {
      dependencies.sqlite3 = '~4.0.2';
    } else if (config.dbDialect === 'mongodb') {
      delete dependencies.sequelize;
      dependencies.mongoose = '~5.3.6';

      delete dependencies['forest-express-sequelize'];
      dependencies['forest-express-mongoose'] = 'latest';
    }

    const pkg = {
      name: config.appName,
      version: '0.0.1',
      private: true,
      scripts: { start: 'node ./bin/www' },
      dependencies,
    };

    fs.writeFileSync(`${pathDest}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  function writeDotGitIgnore(pathDest) {
    const templatePath = `${__dirname}/../templates/app/gitignore`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    fs.writeFileSync(`${pathDest}/.gitignore`, template({}));
  }

  function writeDotGitKeep(pathDest) {
    const templatePath = `${__dirname}/../templates/app/gitkeep`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    fs.writeFileSync(`${pathDest}/.gitkeep`, template({}));
  }

  function getDatabaseUrl() {
    let connectionString;

    if (config.dbConnectionUrl) {
      connectionString = config.dbConnectionUrl;
    } else if (config.dbDialect === 'sqlite') {
      connectionString = `sqlite://${config.dbStorage}`;
    } else {
      connectionString = `${config.dbDialect}://${config.dbUser}`;
      if (config.dbPassword) {
        // NOTICE: Encode password string in case of special chars.
        connectionString += `:${encodeURIComponent(config.dbPassword)}`;
      }

      connectionString += `@${config.dbHostname}:${config.dbPort}/${config.dbName}`;
    }

    return connectionString;
  }

  function writeDotEnv(pathDest, authSecret) {
    const templatePath = `${__dirname}/../templates/app/env`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    const settings = {
      forestEnvSecret: project.defaultEnvironment.secretKey,
      forestAuthSecret: authSecret,
      databaseUrl: getDatabaseUrl(),
      forestUrl: process.env.FOREST_URL,
      devRenderingId: project.defaultEnvironment.renderings[0].id,
      ssl: config.ssl,
      encrypt: config.ssl && config.dbDialect === 'mssql',
      dbSchema: config.dbSchema,
      port: config.appPort,
    };

    fs.writeFileSync(`${pathDest}/.env`, template(settings));
  }

  function writeModels(pathDest, table, fields, references) {
    const templatePath = `${__dirname}/../templates/model.txt`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    const text = template({
      table,
      fields,
      references,
      underscored: isUnderscored(fields),
      timestamps: hasTimestamps(fields),
      schema: config.dbSchema,
      dialect: config.dbDialect,
    });

    fs.writeFileSync(`${pathDest}/models/${table}.js`, text);
  }

  function writeSchemas(pathDest, table, fields, references, primaryKeys) {
    if (!fields.length) { return; }
    const templatePath = `${__dirname}/../templates/schema.txt`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    const text = template({
      table,
      fields,
      references,
      primaryKeys,
      underscored: isUnderscored(fields),
      timestamps: hasTimestamps(fields),
      schema: config.dbSchema,
      dialect: config.dbDialect,
    });

    fs.writeFileSync(`${pathDest}/graphql/${table}.js`, text);
  }


  function writeAppJs(pathDest) {
    const templatePath = `${__dirname}/../templates/app/app.js`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));
    const text = template({ config });

    fs.writeFileSync(`${pathDest}/app.js`, text);
  }

  function writeModelsIndex(pathDest) {
    const templatePath = `${__dirname}/../templates/app/models/index.js`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));
    const text = template({ config });

    fs.writeFileSync(`${pathDest}/models/index.js`, text);
  }

  function writeDockerfile(pathDest) {
    const templatePath = `${__dirname}/../templates/app/Dockerfile`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    const settings = {
      port: config.appPort,
    };

    fs.writeFileSync(`${pathDest}/Dockerfile`, template(settings));
  }

  function writeDockerCompose(pathDest, authSecret) {
    const templatePath = `${__dirname}/../templates/app/docker-compose.yml`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    let forestUrl;
    if (typeof process.env.FOREST_URL !== 'undefined') {
      forestUrl = process.env.FOREST_URL.replace('localhost', 'host.docker.internal');
    }

    const settings = {
      appName: config.appName,
      forestEnvSecret: project.defaultEnvironment.secretKey,
      forestAuthSecret: authSecret,
      forestUrl,
      databaseUrl: getDatabaseUrl().replace('localhost', 'host.docker.internal'),
      ssl: config.ssl,
      encrypt: config.ssl && config.dbDialect === 'mssql',
      dbSchema: config.dbSchema,
      port: config.appPort,
    };

    fs.writeFileSync(`${pathDest}/docker-compose.yml`, template(settings));
  }

  function writeDotDockerIgnore(pathDest) {
    const templatePath = `${__dirname}/../templates/app/dockerignore`;
    const template = _.template(fs.readFileSync(templatePath, 'utf-8'));

    fs.writeFileSync(`${pathDest}/.dockerignore`, template({}));
  }

  function mapToGraphQLTypes(fields) {
    return fields.map((field) => {
      /* eslint no-param-reassign: off */
      switch (field.type) {
        case 'BOOLEAN':
          field.graphqlType = 'Boolean';
          break;
        case 'DATE':
          field.graphqlType = 'DateTime';
          break;
        case 'INTEGER':
          field.graphqlType = 'Int';
          break;
        case 'DOUBLE':
          field.graphqlType = 'Float';
          break;
        case 'STRING':
          field.graphqlType = 'String';
          break;
        default:
          field.graphqlType = 'String';
      }

      return field;
    });
  }

  this.dump = (table, { fields, references, primaryKeys }) => {
    writeModels(path, table, fields, references);
    writeSchemas(path, table, mapToGraphQLTypes(fields), references, primaryKeys);
  };

  const dirs = [
    mkdirp(path),
    mkdirp(binPath),
    mkdirp(routesPath),
    mkdirp(forestPath),
    mkdirp(publicPath),
  ];

  if (config.db) {
    dirs.push(mkdirp(modelsPath));
    dirs.push(mkdirp(schemasPath));
  }

  return P
    .all(dirs)
    .then(() => new KeyGenerator().generate())
    .then((authSecret) => {
      copyTemplate('bin/www', `${binPath}/www`);
      copyTemplate('public/favicon.png', `${path}/public/favicon.png`);

      if (config.db) { writeModelsIndex(path); }
      writeAppJs(path);
      writePackageJson(path);
      writeDotGitIgnore(path);
      writeDotGitKeep(routesPath);
      writeDotEnv(path, authSecret);
      writeDockerfile(path);
      writeDockerCompose(path, authSecret);
      writeDotDockerIgnore(path);
    })
    .then(() => this);
}

module.exports = Dumper;
