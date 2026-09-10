/**
 * 상담신청 폼 동작.
 *
 * 보내는 곳(FORM_ENDPOINT)이 아직 정해지지 않았을 때도 문의가 끊기지 않도록,
 * 저장에 실패하면 카카오톡 상담으로 안내한다.
 */
(function () {
  'use strict';

  /* 접수함 주소. 비어 있으면 카카오톡 안내로 대체된다. */
  var FORM_ENDPOINT = '';

  var form = document.getElementById('consult-form');
  if (!form) return;

  var statusEl = form.querySelector('.apply-status');
  var submitBtn = form.querySelector('.apply-submit');

  /* 물건 상세 페이지에서 넘어온 경우 어떤 물건인지 채워 둔다. */
  var item = new URLSearchParams(location.search).get('item');
  if (item) {
    var wrap = form.querySelector('[data-item-wrap]');
    var input = form.querySelector('#f-item');
    if (wrap && input) { input.value = item; wrap.hidden = false; }
  }

  function setError(id, message) {
    var field = form.querySelector('[data-for="' + id + '"]');
    var input = document.getElementById(id);
    if (field) field.textContent = message || '';
    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }

  /* 010-1234-5678 / 01012345678 / +82 10 … 모두 허용 */
  function phoneOk(v) {
    return /^(\+?82[-\s]?|0)1[016789][-\s]?\d{3,4}[-\s]?\d{4}$/.test(v.trim());
  }

  function validate() {
    var ok = true;
    var name = document.getElementById('f-name');
    var phone = document.getElementById('f-phone');
    var agree = document.getElementById('f-agree');

    if (!name.value.trim()) { setError('f-name', '이름을 입력해 주세요.'); ok = false; }
    else setError('f-name', '');

    if (!phone.value.trim()) { setError('f-phone', '연락처를 입력해 주세요.'); ok = false; }
    else if (!phoneOk(phone.value)) { setError('f-phone', '연락처 형식을 확인해 주세요. 예) 010-1234-5678'); ok = false; }
    else setError('f-phone', '');

    if (!agree.checked) { setError('f-agree', '개인정보 수집에 동의해 주셔야 상담이 가능합니다.'); ok = false; }
    else setError('f-agree', '');

    if (!ok) {
      var firstBad = form.querySelector('.is-invalid, #f-agree:invalid');
      if (firstBad && firstBad.focus) firstBad.focus();
    }
    return ok;
  }

  /* 입력을 고치는 즉시 빨간 메시지를 지워 준다 */
  ['f-name', 'f-phone'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { setError(id, ''); });
  });
  var agreeEl = document.getElementById('f-agree');
  if (agreeEl) agreeEl.addEventListener('change', function () { setError('f-agree', ''); });

  function fallbackToKakao(reason) {
    statusEl.className = 'apply-status is-warn';
    statusEl.innerHTML = reason
      + ' <a href="https://open.kakao.com/o/s91CvTFf" target="_blank" rel="noreferrer">카카오톡으로 문의하기 ↗</a>'
      + ' 또는 <a href="tel:0532810759">053-281-0759</a>';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) return;

    if (!FORM_ENDPOINT) {
      fallbackToKakao('아직 온라인 접수 준비 중입니다.');
      return;
    }

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    data['신청시각'] = new Date().toLocaleString('ko-KR');

    submitBtn.disabled = true;
    statusEl.className = 'apply-status';
    statusEl.textContent = '보내는 중…';

    fetch(FORM_ENDPOINT, {
      method: 'POST',
      /* Apps Script 등 단순 엔드포인트에서 preflight 를 피하려고 text/plain 으로 보낸다 */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r; })
      .then(function () {
        form.querySelectorAll('input, select, textarea, button').forEach(function (el) { el.disabled = true; });
        statusEl.className = 'apply-status is-ok';
        statusEl.textContent = '신청이 접수되었습니다. 영업일 기준 1일 안에 연락드리겠습니다.';
      })
      .catch(function () {
        submitBtn.disabled = false;
        fallbackToKakao('전송에 실패했습니다.');
      });
  });
})();
