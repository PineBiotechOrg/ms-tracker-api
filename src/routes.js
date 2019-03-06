// bot deploy id in tracker ––> 1130000027868856

module.exports = (app, db) => {
  require('isomorphic-fetch');

  app.get('/test', async (req, res) => {
    const result = await db.collection('moscow')
      .find({})
      .toArray();

    if (!result) {
      res.status(404).send('Not found');
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(result));
  });

  app.get('/api/v1/tracker/tickets', async (req, res) => {
    const {queue} = req.query;

    const response = await fetch('https://api.tracker.yandex.net/v2/issues/_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({queue}),
        timeout: 10000
      }
    );

    const json = await response.json();

    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(JSON.stringify(json));
  });

  app.get('/api/v1/tracker/ticket', async (req, res) => {
    const {key} = req.query;

    const response = await fetch('https://api.tracker.yandex.net/v2/issues/_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({filter: {key}}),
        timeout: 10000
      }
    );

    const json = await response.json();

    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(JSON.stringify(json));
  });

  const getUsersFromQueue = async (queue) => {
    if (!queue) {
      return {
        status: 500,
        json: null
      };
    }

    const response = await fetch(`https://api.tracker.yandex.net/v2/queues/${queue}?expand=all`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
        'X-Org-Id': process.env.YA_TRACKER_ID
      },
      timeout: 10000
    });

    return {
      status: response.status,
      json: (await response.json()).teamUsers.map(user => user.id)
    };
  };

  const openMergeRequest = async (body) => {
    const {user, repository, object_attributes} = body;
    const {target_branch, source_branch, id, created_at, title, url, merge_commit_sha} = object_attributes;

    // const queue = source_branch.split('-')[0];
    const queue = 'DEPLOY';
    const users = await getUsersFromQueue(queue);

    const create = await fetch('https://api.tracker.yandex.net/v2/issues/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({
          summary: `Деплой ${source_branch} задачи`,
          queue,
          parent: source_branch,
          description: `Деплой ${source_branch} на машинку ${target_branch}.mont-smart.com.\n Ссылка на merge request: ${url}.\n SHA деплоя: ${merge_commit_sha}\n Деплой начался: ${created_at}`,
          type: {key: 'task'},
          priority: {key: 'normal'},
          followers: users.json,
          assignee: '1130000027868856'
        }),
        timeout: 10000
      }
    );

    if (create.status >= 300) {
      return 400;
    }

    await fetch(`https://hooks.slack.com/services/${process.env.SLACK_GIT_TOKEN}`, {
        method: 'POST',
        body: JSON.stringify({text: `Тикет: ${source_branch}\nМашинка: ${target_branch}\nGit: ${url}\nSHA деплоя: ${merge_commit_sha}\n Деплой начался в: ${created_at}\n––MS––\n`,}),
        timeout: 10000
      }
    );

    return 200;
  };

  const deployMergeRequest = async (id, date) => {
    const ticketResp = await fetch('https://api.tracker.yandex.net/v2/issues/_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({
          filter: {
            description: `SHA деплоя: ${id}`
          }
        }),
        timeout: 10000
      }
    );
    const ticket = (await ticketResp.json())[0];

    let summary = '';
    if (ticket.summary.toLowerCase().indexOf('[ошибка]') !== -1) {
      summary = ticket.summary.replace('[ОШИБКА]', '[РЕШЕНО]');
    } else if (ticket.summary.toLowerCase().indexOf('[решено]') !== -1) {
      summary = ticket.summary;
    } else {
      summary = `${ticket.summary} [РЕШЕНО]`;
    }

    const create = await fetch(`https://api.tracker.yandex.net/v2/issues/${ticket.key}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({
          summary,
          description: `${ticket.description}\n Деплой закончился: ${date}`
        }),
        timeout: 10000
      }
    );

    if (create.status >= 300) {
      return 400;
    }

    await fetch(`https://hooks.slack.com/services/${process.env.SLACK_RELEASE_TOKEN}`, {
        method: 'POST',
        body: JSON.stringify({text: `${ticket.description}\n Деплой закончился: ${date}\n––MS––\n`,}),
        timeout: 10000
      }
    );

    return 200;
  };

  const deployFailedMergeRequest = async (id, date) => {
    const ticketResp = await fetch('https://api.tracker.yandex.net/v2/issues/_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({
          filter: {
            description: `SHA деплоя: ${id}`
          }
        }),
        timeout: 10000
      }
    );
    const ticket = (await ticketResp.json())[0];

    let summary = '';
    if (ticket.summary.toLowerCase().indexOf('[ошибка]') !== -1) {
      summary = ticket.summary;
    } else if (ticket.summary.toLowerCase().indexOf('[решено]') !== -1) {
      summary = ticket.summary.replace('[РЕШЕНО]', '[ОШИБКА]');
    } else {
      summary = `${ticket.summary} [ОШИБКА]`;
    }

    const create = await fetch(`https://api.tracker.yandex.net/v2/issues/${ticket.key}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({
          summary,
          description: `${ticket.description}\n Деплой закончился: ${date}`
        }),
        timeout: 10000
      }
    );

    if (create.status >= 300) {
      return 400;
    }

    await fetch(`https://hooks.slack.com/services/${process.env.SLACK_GIT_TOKEN}`, {
        method: 'POST',
        body: JSON.stringify({text: `ОШИБКА ДЕПЛОЯ!\n${ticket.description}\n––MS––\n`,}),
        timeout: 10000
      }
    );

    return 200;
  };

  app.post('/api/v1/tracker/webhook/merge_request', async (req, res) => {
    const {object_kind, object_attributes} = req.body;

    if (object_kind === 'pipeline' && object_attributes.status === 'success') {
      return res.status(await deployMergeRequest(object_attributes.sha, object_attributes.finished_at));
    } else if (object_kind === 'pipeline' && object_attributes.status === 'failed') {
      return res.status(await deployFailedMergeRequest(object_attributes.sha, object_attributes.finished_at));
    }

    if (object_kind !== 'merge_request') {
      return res.status(200);
    }
    const {action} = object_attributes;

    switch (action) {
      case 'merge':
        return res.status(await openMergeRequest(req.body));
      default:
        await fetch(`https://hooks.slack.com/services/${process.env.SLACK_GIT_TOKEN}`, {
            method: 'POST',
            body: JSON.stringify({text: `Тикет: ${object_attributes.source_branch}\nGit: ${object_attributes.url}\nДействие: ${action}\n––MS––\n`,}),
            timeout: 10000
          }
        );
        return res.status(200);
    }
  });

  app.post('/api/v1/tracker/ticket/create', async (req, res) => {
    const {
      summary, queue, parent, description = '', type = {key: 'task'}, priority = {key: 'normal'}
    } = req.body;

    const users = await getUsersFromQueue(queue);

    const newTicketInfo = {
      summary,
      queue,
      parent,
      description: `${description}${users.status === 500 ? '\nНе удалось найти пользователей очереди' : ''}`,
      type,
      priority,
      followers: users.json,
      assignee: '1130000027868856' // TODO: close
    };

    const parentInfo = parent ? {
      key: parent
    } : {};

    const create = await fetch('https://api.tracker.yandex.net/v2/issues/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({...newTicketInfo, ...parentInfo}),
        timeout: 10000
      }
    );

    const createJson = await create.json();

    res.setHeader('Content-Type', 'application/json');
    if (create.status >= 300) {
      res.status(400).send(JSON.stringify({
        response: 'Something wrong'
      }));
      return;
    }

    const link = await fetch(`https://api.tracker.yandex.net/v2/issues/${createJson.key}/links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `OAuth ${process.env.YA_TRACKER_TOKEN}`,
          'X-Org-Id': process.env.YA_TRACKER_ID
        },
        body: JSON.stringify({
          relationship: 'relates',
          issue: 'ADMINKA-1' // TODO: get from gitlab
        }),
        timeout: 10000
      }
    );

    if (link.status >= 300) {
      res.status(400).send(JSON.stringify({
        response: 'Something wrong'
      }));
      return;
    }

    res.send(JSON.stringify({
      response: 'Ok'
    }));
  });

  app.use('*', (req, res) => {
    res.sendStatus(404);
  });
};
