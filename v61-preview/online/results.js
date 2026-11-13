(function (root) {
  'use strict';

  var MAX_PLAYERS = 32;
  var COLORS = [
    '#e63946',
    '#457b9d',
    '#2a9d8f',
    '#f4a261',
    '#6a4c93',
    '#0081a7',
    '#f72585',
    '#43aa8b',
    '#f8961e',
    '#577590',
    '#d62828',
    '#277da1',
    '#90be6d',
    '#f3722c',
    '#9b5de5',
    '#00b4d8',
    '#ef476f',
    '#118ab2',
    '#06d6a0',
    '#fb8500',
    '#8338ec',
    '#3a86ff',
    '#bc6c25',
    '#606c38',
    '#ff006e',
    '#3a0ca3',
    '#4d908e',
    '#f94144',
    '#4895ef',
    '#f9c74f',
    '#7209b7',
    '#4361ee'
  ];

  function finite(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function playerList(room) {
    var source = Array.isArray(room && room.players)
      ? room.players
      : Object.values((room && room.players) || {});
    return source
      .filter(function (p) {
        return p && p.id != null;
      })
      .slice(0, MAX_PLAYERS)
      .map(function (p, i) {
        return {
          id: String(p.id),
          name: p.name == null ? String(p.id) : String(p.name),
          score: finite(p.score, 0),
          index: i
        };
      });
  }
  function historyList(room) {
    return Array.isArray(room && room.history) ? room.history : [];
  }
  function answerFor(round, id) {
    return (round && round.answers && round.answers[id]) || null;
  }
  function scoreFor(round, id) {
    return round && round.scores && Number.isFinite(Number(round.scores[id]))
      ? Number(round.scores[id])
      : null;
  }
  function deltaFor(round, id) {
    var answer = answerFor(round, id);
    return answer && Number.isFinite(Number(answer.delta)) ? Number(answer.delta) : 0;
  }
  function niceStep(span) {
    if (!(span > 0)) return 1;
    var raw = span / 6,
      power = Math.pow(10, Math.floor(Math.log10(raw))),
      n = raw / power;
    var factor = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return factor * power;
  }
  function axisFor(values) {
    var min = 0,
      max = 0;
    values.forEach(function (v) {
      v.forEach(function (n) {
        if (n < min) min = n;
        if (n > max) max = n;
      });
    });
    if (min === max) {
      min = min < 0 ? min - 1 : 0;
      max = max > 0 ? max + 1 : 1;
    }
    var step = niceStep(max - min),
      lo = Math.floor(min / step) * step,
      hi = Math.ceil(max / step) * step;
    if (lo > 0) lo = 0;
    if (hi < 0) hi = 0;
    if (lo === hi) {
      lo -= step;
      hi += step;
    }
    return {
      min: Number(lo.toFixed(10)),
      max: Number(hi.toFixed(10)),
      step: Number(step.toFixed(10))
    };
  }
  function durationText(room, language) {
    var ms = finite(room && room.durationMs, NaN);
    if (!Number.isFinite(ms)) {
      var start = finite(room && room.startedAt, NaN),
        end = finite(room && room.finishedAt, NaN);
      ms = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
    }
    var total = Math.max(0, Math.round(ms / 1000)),
      h = Math.floor(total / 3600),
      m = Math.floor((total % 3600) / 60),
      s = total % 60;
    if (language === 'zh-Hans')
      return h
        ? h + '小时' + String(m).padStart(2, '0') + '分' + String(s).padStart(2, '0') + '秒'
        : m + '分' + String(s).padStart(2, '0') + '秒';
    if (language === 'zh-Hant')
      return h
        ? h + '小時' + String(m).padStart(2, '0') + '分' + String(s).padStart(2, '0') + '秒'
        : m + '分' + String(s).padStart(2, '0') + '秒';
    return h
      ? h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's'
      : m + 'm ' + String(s).padStart(2, '0') + 's';
  }
  function summary(room, options) {
    options = options || {};
    var players = playerList(room),
      history = historyList(room),
      current = Object.create(null);
    players.forEach(function (p) {
      current[p.id] = 0;
    });
    var series = players.map(function (p) {
      return { id: p.id, name: p.name, color: COLORS[p.index % COLORS.length], values: [0] };
    });
    var correct = players.map(function (p) {
      return { id: p.id, choice: 0, open: 0, total: 0 };
    });
    var participation = players.map(function (p) {
      return { id: p.id, answered: 0, passed: 0, missed: 0, turnOpportunities: 0 };
    });
    history.forEach(function (round) {
      players.forEach(function (p, i) {
        var next = scoreFor(round, p.id);
        current[p.id] = next == null ? current[p.id] + deltaFor(round, p.id) : next;
        series[i].values.push(current[p.id]);
        var answer = answerFor(round, p.id);
        if (answer && answer.correct === true) {
          correct[i][round.type === 'open' ? 'open' : 'choice']++;
          correct[i].total++;
        }
        if (answer) {
          var status = answer.status;
          if (status === 'answered' || (status === undefined && answer.unanswered === false))
            participation[i].answered++;
          else if (status === 'passed') participation[i].passed++;
          else if (status === 'timeout' || (status === undefined && answer.unanswered === true))
            participation[i].missed++;
          if (round.selection === 'turn' || room.settings?.selection === 'turn') {
            if (status !== 'notTurn') participation[i].turnOpportunities++;
          }
        }
      });
    });
    var totals = players.map(function (p) {
      return { id: p.id, name: p.name, score: current[p.id], rank: 0 };
    });
    totals.sort(function (a, b) {
      return (
        b.score - a.score ||
        players.findIndex(function (p) {
          return p.id === a.id;
        }) -
          players.findIndex(function (p) {
            return p.id === b.id;
          })
      );
    });
    totals.forEach(function (p, i) {
      p.rank = i && p.score === totals[i - 1].score ? totals[i - 1].rank : i + 1;
    });
    var ranks = Object.create(null);
    totals.forEach(function (p) {
      ranks[p.id] = p.rank;
    });
    series.forEach(function (s) {
      s.rank = ranks[s.id];
    });
    return {
      ranks: ranks,
      totals: totals,
      series: series,
      correctCounts: correct,
      participation: participation,
      // Named alias for consumers that render the four v2 participation counters.
      participationCounts: participation,
      durationText: durationText(room, options.language || 'en'),
      axis: axisFor(
        series.map(function (s) {
          return s.values;
        })
      )
    };
  }
  function draw(canvas, room, options) {
    options = options || {};
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    var data = summary(room, options),
      ctx = canvas.getContext('2d');
    if (!ctx) return data;
    var rect =
      typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
    var cssW = Math.max(
      1,
      Math.round((rect && rect.width) || canvas.clientWidth || canvas.width || 640)
    );
    var cssH = Math.max(
      1,
      Math.round((rect && rect.height) || canvas.clientHeight || canvas.height || 320)
    );
    var dpr = Math.max(2, Math.min(4, finite(root && root.devicePixelRatio, 1)));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    if (canvas.style) canvas.style.width = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    var pad = { left: 68, right: 18, top: 20, bottom: 36 },
      x0 = pad.left,
      x1 = Math.max(x0 + 1, cssW - pad.right),
      y0 = pad.top,
      y1 = Math.max(y0 + 1, cssH - pad.bottom),
      a = data.axis;
    function y(v) {
      return y1 - ((v - a.min) / (a.max - a.min)) * (y1 - y0);
    }
    ctx.strokeStyle = '#222';
    ctx.fillStyle = '#222';
    ctx.lineWidth = 1;
    ctx.font = '600 14px "Source Han Sans", sans-serif';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    var zero = y(0);
    ctx.strokeStyle = '#888';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, zero);
    ctx.lineTo(x1, zero);
    ctx.stroke();
    ctx.setLineDash([]);
    for (
      var tick = Math.ceil(a.min / a.step) * a.step;
      tick <= a.max + a.step * 0.001;
      tick += a.step
    ) {
      var ty = y(tick);
      if (ty < y0 - 1 || ty > y1 + 1) continue;
      ctx.fillText(String(Number(tick.toFixed(6))), 2, ty + 4);
    }
    data.series.forEach(function (s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      s.values.forEach(function (v, i) {
        var x = x0 + (s.values.length <= 1 ? 0 : ((x1 - x0) * i) / (s.values.length - 1));
        var yy = Math.max(y0, Math.min(y1, y(v)));
        if (i) ctx.lineTo(x, yy);
        else ctx.moveTo(x, yy);
      });
      ctx.stroke();
    });
    ctx.fillStyle = '#222';
    ctx.fillText('0', x0 - 3, y1 + 16);
    if (data.series[0])
      ctx.fillText(String(Math.max(0, data.series[0].values.length - 1)), x1 - 7, y1 + 16);
    return data;
  }
  var api = Object.freeze({ summary: summary, draw: draw, colors: COLORS.slice() });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QuizResults = api;
})(typeof window === 'object' ? window : globalThis);
