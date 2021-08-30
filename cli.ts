#!/usr/bin/env node

import axios, {AxiosInstance} from 'axios'
import {Command} from 'commander';
import {spawn} from 'child_process'

async function fetchAllGitlabVariables(gitlabApi: AxiosInstance, opts: { project: string }) {
  const variables: Variable[] = [];
  let page = 1;
  do {
    const {
      data: currentPage
    } = await gitlabApi.get<Variable[]>(`/api/v4/projects/${opts.project}/variables?per_page=100&page=${page}`)


    const isLastPage = currentPage.length == 0;
    if (isLastPage) {
      break;
    }

    variables.push(...currentPage)

    page += 1;

  } while (true);
  return variables;
}

async function main() {
  const program = new Command();

  program.option("-u, --url <url>", "Gitlab Url", "https://gitlab.com")

  program.requiredOption("-p, --project <project>", "Gitlab project id", process.env.CI_PROJECT_ID)

  program.requiredOption("-t, --access-token <accessToken>", "Gitlab API Access Token", process.env.GITLAB_ACCESS_TOKEN)

  program.option("-e, --environment <environment>", "Only export variables for this environment name", process.env.CI_ENVIRONMENT_NAME)

  program.requiredOption("-t, --access-token <accessToken>", "Gitlab API Access Token", process.env.GITLAB_ACCESS_TOKEN)

  program.parse()

  const opts = program.opts() as {
    project: string
    url: string
    environment: string
    accessToken: string
  };

  const gitlabApi = axios.create({
    baseURL: opts.url,
    headers: {
      'PRIVATE-TOKEN': opts.accessToken
    }
  })

  const variables = await fetchAllGitlabVariables(gitlabApi, opts);

  const newEnvVariables = variables.filter(variable => {
    const isDefault = variable.environment_scope == '*';
    const noOverrideExists = !variables.some(otherEnv =>
      otherEnv.key == variable.key && otherEnv.environment_scope == opts.environment
    )
    if (isDefault && noOverrideExists) {
      return true
    }
    return opts.environment === variable.environment_scope
  })
    .reduce((acc, cur) => ({...acc, [cur.key]: cur.value}), {})

  const combinedEnvs = {
    ...process.env,
    ...newEnvVariables
  }

  const [cmd, ...args] = program.args

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    spawn(cmd, args, {
      env: combinedEnvs,
      stdio: 'inherit',
    })
      .on('error', (err) => {
        reject(err)
      })
      .on('exit', (code, signal) => {
        resolve(code)
      })
  });

  process.exit(exitCode || 0)
}

interface Variable {
  variable_type: "env_var",
  key: string
  value: string
  environment_scope: '*' | string
}

main().catch(err => {
  console.log(err);
  process.exit(1)
})

