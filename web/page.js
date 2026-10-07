// Thin DOM/fetch glue for the config page (web/index.html). All testable logic lives in
// web/onboard.js and web/goals.js (loaded first); this file only wires the DOM to them,
// so it is review-only, like src/pkjs/index.js. Keep it thin.
(function () {
  var params = onboard.parseParams(location.search, location.hash);
  var url = document.getElementById('u');
  var token = document.getElementById('t');
  var theme = document.getElementById('theme');
  var status = document.getElementById('status');
  // The service URL is app-owned: always use the page's own constant, never a value from the
  // fragment, so a crafted #baseUrl= can't make Generate POST to (or Copy copy) an attacker URL.
  url.value = onboard.DEFAULT_BASE_URL;
  token.value = params.token;
  theme.value = String(params.theme);

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = kind || '';
  }

  function generate() {
    if (onboard.needsOverwriteConfirm(token.value) &&
        !confirm('This creates a new identity and won\'t see your old goals - continue?')) {
      return;
    }
    var req = onboard.signupRequest(url.value);
    setStatus('Generating…', '');
    fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
      .then(function (resp) {
        return resp.text().then(function (body) {
          var result = onboard.classifySignup(resp.status, function (name) {
            return resp.headers.get(name);
          }, body);
          if (result.kind === 'ok') {
            token.value = result.token;
            setStatus('Token generated. Copy it into your Index webhook, then Save.', 'ok');
            loadGoals();
          } else {
            setStatus(result.message, 'err');
          }
        });
      })
      .catch(function () {
        setStatus('Could not reach the service. It may not allow this page yet (CORS), ' +
          'or you are offline.', 'err');
      });
  }

  // Replay the flash from the start even on rapid repeat clicks (reflow resets the animation).
  function flash(button) {
    button.classList.remove('flash');
    void button.offsetWidth;
    button.classList.add('flash');
  }

  function copyField(input, label, button) {
    if (!input.value) {
      return setStatus('Nothing to copy yet.', 'err');
    }
    input.select();
    // Flash on the click itself, not when the clipboard write resolves: write latency scales
    // with the text, so deferring it made the long service URL flash lag behind the token's.
    flash(button);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function () {
        setStatus(label + ' copied.', 'ok');
      }, function () {
        setStatus('Select the field and copy manually.', '');
      });
    } else {
      setStatus('Select the field and copy manually.', '');
    }
  }

  function save() {
    // An empty token clears the watchface's saved token; confirm so a stray tap can't wipe it.
    if (!token.value.trim() &&
        !confirm('No token entered - this clears the watchface\'s saved token. Continue?')) {
      return;
    }
    location.href = onboard.buildReturnUrl(params.returnTo, token.value, theme.value);
  }

  // ---- Goals ----
  var gname = document.getElementById('gname');
  var gtype = document.getElementById('gtype');
  var galiases = document.getElementById('galiases');
  var gstatus = document.getElementById('gstatus');
  var glist = document.getElementById('glist');
  var gwarn = document.getElementById('gwarn');

  function setGoalStatus(text, kind) {
    gstatus.textContent = text;
    gstatus.className = kind || '';
  }

  function renderGoals(list) {
    glist.textContent = '';
    list.forEach(function (goal, i) {
      var li = document.createElement('li');
      li.appendChild(document.createTextNode('#' + (goal.number || i + 1) + '  ' + String(goal.name)));
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = '  ' + (goal.type === 'count' ? 'count' : 'done/not');
      li.appendChild(meta);
      glist.appendChild(li);
    });
    var limits = goals.describeGoalLimits(list);
    var warnings = [];
    if (limits.hidden > 0) {
      warnings.push('The watch shows the first ' + goals.WATCH_MAX_GOALS + ' goals; ' +
        limits.hidden + ' more won\'t appear.');
    }
    if (limits.longNames.length) {
      warnings.push('Shortened on the watch (over ' + goals.WATCH_NAME_LEN + ' chars): ' +
        limits.longNames.join(', ') + '.');
    }
    gwarn.textContent = warnings.join(' ');
  }

  // Shared GET/POST handler for the two goal endpoints: run the matching classifier, then the
  // caller's onOk. Network/CORS failures and non-OK results land in the goal status line.
  function goalFetch(req, classify, onOk) {
    fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
      .then(function (resp) {
        return resp.text().then(function (body) {
          var result = classify(resp.status, body);
          if (result.kind === 'ok') {
            onOk(result);
          } else {
            setGoalStatus(result.message, 'err');
          }
        });
      })
      .catch(function () {
        setGoalStatus('Could not reach the service (it may not allow this page yet, or you are offline).', 'err');
      });
  }

  function loadGoals() {
    if (!token.value.trim()) {
      glist.textContent = '';
      gwarn.textContent = '';
      return setGoalStatus('Add a token above to create and list goals.', '');
    }
    goalFetch(goals.listGoalsRequest(onboard.DEFAULT_BASE_URL, token.value),
      goals.classifyGoalList, function (result) { renderGoals(result.goals); });
  }

  function createGoal() {
    if (!token.value.trim()) {
      return setGoalStatus('Add a token above first.', 'err');
    }
    if (!gname.value.trim()) {
      return setGoalStatus('Enter a goal name.', 'err');
    }
    setGoalStatus('Creating…', '');
    goalFetch(goals.goalRequest(onboard.DEFAULT_BASE_URL, token.value,
      { name: gname.value, type: gtype.value, aliases: galiases.value }),
    goals.classifyGoal, function (result) {
      gname.value = '';
      galiases.value = '';
      setGoalStatus(result.message + (result.logHint ? ' ' + result.logHint : ''), 'ok');
      loadGoals();
    });
  }

  document.getElementById('gen').addEventListener('click', generate);
  document.getElementById('copyUrl').addEventListener('click', function (e) {
    copyField(url, 'Service URL', e.currentTarget);
  });
  document.getElementById('copy').addEventListener('click', function (e) {
    copyField(token, 'Token', e.currentTarget);
  });
  document.getElementById('gcreate').addEventListener('click', createGoal);
  // Re-list when the token changes (paste or Generate) so goals track the active identity.
  token.addEventListener('change', loadGoals);
  document.getElementById('save').addEventListener('click', save);
  loadGoals();
})();
