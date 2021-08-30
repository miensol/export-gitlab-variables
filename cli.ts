#!/usr/bin/env node

import axios from 'axios'
import { Command } from 'commander';
import { spawn } from 'child_process'

async function main() {
  const program = new Command();

  program.option("-u, --url <url>", "Gitlab Url", "https://gitlab.com")

  program.requiredOption("-p, --project <project>", "Gitlab project id", process.env.CI_PROJECT_ID)

  program.requiredOption("-t, --access-token <accessToken>", "Gitlab API Access Token", process.env.GITLAB_ACCESS_TOKEN)

  program.option("-e, --environment <environment>", "Only export variables for this environment name", process.env.CI_ENVIRONMENT_NAME)

  program.requiredOption("-t, --access-token <accessToken>", "Gitlab API Access Token", process.env.GITLAB_ACCESS_TOKEN)

  program.parse()

  const opts = program.opts();

  const gitlabApi = axios.create({
    baseURL: opts.url,
    headers: {
      'PRIVATE-TOKEN': opts.accessToken
    }
  })

  const { data: variables } = await gitlabApi.get<Variable[]>(`/api/v4/projects/${opts.project}/variables?per_page=1000`)

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
    .reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {})

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

