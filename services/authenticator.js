const fs = require('fs');
const os = require('os');
const P = require('bluebird');
const agent = require('superagent-promise')(require('superagent'), P);
const ProjectSerializer = require('../serializers/project');
const EnvironmentSerializer = require('../serializers/environment');
const ProjectDeserializer = require('../deserializers/project');
const EnvironmentDeserializer = require('../deserializers/environment');
const logger = require('./logger');

function Authenticator() {
  this.getAuthToken = () => {
    try {
      return fs.readFileSync(`${os.homedir()}/.lumberrc`);
    } catch (e) {
      return null;
    }
  };

  this.createProject = async (config) => {
    let project;

    try {
      project = await agent
        .post(`${config.serverHost}/api/projects`)
        .set('Authorization', `Bearer ${config.authToken}`)
        .set('forest-origin', 'Lumber')
        .send(new ProjectSerializer({
          name: config.appName,
        }))
        /* eslint new-cap: off */
        .then(response => new ProjectDeserializer.deserialize(response.body));
    } catch (error) {
      if (error.message === 'Conflict') {
        const { projectId } = error.response.body.errors[0].meta;
        project = await agent
          .get(`${config.serverHost}/api/projects/${projectId}`)
          .set('Authorization', `Bearer ${config.authToken}`)
          .set('forest-origin', 'Lumber')
          .send()
          .then(response => new ProjectDeserializer.deserialize(response.body));

        // NOTICE: Avoid to erase an existing project that has been already initialized.
        if (project.initializedAt) { throw error; }
      } else {
        throw error;
      }
    }

    /* eslint no-param-reassign: off */
    project.name = config.appName;

    const environment = project.defaultEnvironment;
    const updatedEnvironment = await agent
      .put(`${config.serverHost}/api/environments/${environment.id}`)
      .set('Authorization', `Bearer ${config.authToken}`)
      .send(new EnvironmentSerializer({
        id: environment.id,
        apiEndpoint: `http://${config.appHostname}:${config.appPort}`,
      }))
      .then(response => new EnvironmentDeserializer.deserialize(response.body));
    project.defaultEnvironment.secretKey = updatedEnvironment.secretKey;

    return project;
  };

  this.login = config => agent
    .post(`${config.serverHost}/api/sessions`, {
      email: config.email,
      password: config.password,
    })
    .then(response => response.body)
    .then((auth) => {
      config.authToken = auth.token;
      return fs.writeFileSync(`${os.homedir()}/.lumberrc`, auth.token);
    });


  this.logout = async (opts) => {
    const path = `${os.homedir()}/.lumberrc`;

    return new P((resolve, reject) => {
      fs.stat(path, (err) => {
        if (err === null) {
          fs.unlinkSync(path);

          if (opts.log) {
            logger.success('You\'re now unlogged.');
          }

          resolve();
        } else if (err.code === 'ENOENT') {
          if (opts.log) {
            logger.info('You\'re already unlogged.');
          }

          resolve();
        } else {
          reject(err);
        }
      });
    });
  };
}

module.exports = new Authenticator();
