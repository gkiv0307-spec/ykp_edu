/**
 * 상담신청 폼 동작.
 *
 * 보내는 곳(FORM_ENDPOINT)이 아직 정해지지 않았을 때도 문의가 끊기지 않도록,
 * 저장에 실패하면 카카오톡 상담으로 안내한다.
 */
(function () {
  'use strict';

  /* 접수함 주소 (구글 시트 Apps Script 웹앱). 비어 있으면 카카오톡 안내로 대체된다.
     시트: 옆커폰부동산에듀 - 상담신청 접수함
     스크립트를 고쳤을 때는 "배포 → 배포 관리 → 새 버전"까지 해야 반영된다.
     설정 방법은 docs/상담신청-접수함-설정.md 참고. */
  var FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycby_v46XaI_C-43nlxoTUOSybY4_6myH6nuvovUA7mGurfGI2U0TcwvoOH3I9qoRVJ_6qw/exec';

  var form = document.getElementById('consult-form');
  if (!form) return;

  var statusEl = form.querySelector('.apply-status');
  var submitBtn = form.querySelector('.apply-submit');

  var params = new URLSearchParams(location.search);

  /* 물건 상세 페이지에서 넘어온 경우 어떤 물건인지 채워 둔다. */
  var item = params.get('item');
  if (item) {
    var wrap = form.querySelector('[data-item-wrap]');
    var input = form.querySelector('#f-item');
    if (wrap && input) { input.value = item; wrap.hidden = false; }
  }

  /* 과정 페이지에서 넘어온 경우 어떤 과정인지 함께 담는다.
     이걸 안 담으면 상담 전화를 걸 때 무엇을 보고 왔는지 알 수 없다. */
  var course = params.get('course');
  if (course) {
    var cWrap = form.querySelector('[data-course-wrap]');
    var cInput = form.querySelector('#f-course');
    if (cWrap && cInput) { cInput.value = course; cWrap.hidden = false; }

    var interest = document.getElementById('f-interest');
    if (interest) {
      for (var i = 0; i < interest.options.length; i += 1) {
        if (/수강/.test(interest.options[i].value)) { interest.selectedIndex = i; break; }
      }
    }
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

  /* 같은 내용이 두 번 들어오지 않도록 폼을 잠근다 */
  function lockForm() {
    var els = form.querySelectorAll('input, select, textarea, button');
    for (var i = 0; i < els.length; i += 1) els[i].disabled = true;
  }

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

    /* 과정 페이지에서 왔다면 그 과정을 관심분야에 붙여 보낸다.
       접수 시트에 '과정' 열이 따로 없어서, 열을 추가하지 않고도
       어떤 과정을 보고 신청했는지 남기기 위해서다. */
    if (data['과정']) {
      data['관심분야'] = (data['관심분야'] || '') + ' — ' + data['과정'];
    }

    submitBtn.disabled = true;
    statusEl.className = 'apply-status';
    statusEl.textContent = '보내는 중…';

    /* 응답이 아주 늦게 오는 경우가 있어 20초에서 끊는다.
       끊더라도 요청은 이미 서버에 닿았을 가능성이 크므로 폼은 잠근 채
       두어, 고객이 같은 내용을 또 보내지 않게 한다. */
    var timedOut = false;
    var controller = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, 20000);

    fetch(FORM_ENDPOINT, {
      method: 'POST',
      /* Apps Script 등 단순 엔드포인트에서 preflight 를 피하려고 text/plain 으로 보낸다 */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
      signal: controller ? controller.signal : undefined,
    })
      /* 응답 코드를 성공 판정에 쓰지 않는다. 일부러 그렇게 두었다.
         Apps Script 는 doPost 를 다 실행한 뒤에야 결과 페이지로 넘겨주는데,
         그 결과 페이지가 이따금 404 로 온다. 그때도 시트에는 이미 기록된
         상태라, 404 를 실패로 처리하면 접수됐는데도 실패라고 안내해
         고객이 다시 신청하게 된다(중복 접수).
         응답이 왔다 = 서버가 처리를 마쳤다 로 보고, 아예 도달하지 못한
         경우(fetch 자체가 실패)만 아래 catch 에서 실패로 처리한다. */
      .then(function () {
        clearTimeout(timer);
        lockForm();
        statusEl.className = 'apply-status is-ok';
        statusEl.textContent = '신청이 접수되었습니다. 영업일 기준 1일 안에 연락드리겠습니다.';
      })
      .catch(function () {
        clearTimeout(timer);
        if (timedOut) {
          /* 요청은 갔는데 응답만 못 받은 상황. 다시 보내라고 하면 중복이 된다. */
          lockForm();
          statusEl.className = 'apply-status is-warn';
          statusEl.innerHTML = '접수 확인이 늦어지고 있습니다. 신청은 접수되었을 가능성이 큽니다.'
            + ' 확인이 필요하시면 <a href="https://open.kakao.com/o/s91CvTFf" target="_blank" rel="noreferrer">카카오톡 ↗</a>'
            + ' 또는 <a href="tel:0532810759">053-281-0759</a> 로 문의해 주세요.';
          return;
        }
        submitBtn.disabled = false;
        fallbackToKakao('전송에 실패했습니다.');
      });
  });
})();
