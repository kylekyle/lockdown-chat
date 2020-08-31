import marked from 'marked';
import DOMPurify from 'dompurify';
import MessageBus from 'message-bus-client';

// importing all of bootstrap makes the bundle huge
// if you need some plugin, import it specifically: 
// import 'bootstrap/js/dist/<plugin-name>';
import 'popper.js'
import 'bootstrap/js/dist/dropdown';

// bootstrap-select is what we use for the instructor's To: box
import 'bootstrap-select'

MessageBus.baseUrl = `${location.pathname}/`;

// https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
String.prototype.hashCode = function() {
  let hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

String.prototype.color = function() {
  const colors = [
    "rosybrown",
    "tomato",
    "black",
    "orange",
    "cornflowerblue",
    "cadetblue",
    "goldenrod",
    "darkred",
    "crimson",
    "chocolate",
    "darkblue",
    "darkgoldenrod",
    "darkcyan",
    "orchid",
    "darkslategrey",
    "darkgreen",
    "darkorange",
    "blue",
    "blueviolet",
    "brown"
  ];
  return colors[Math.abs(this.hashCode()) % 20];
};

const users = [];
const id = document.currentScript.getAttribute('data-id');
const instructor = document.currentScript.getAttribute('data-instructor') == 'true';

const badge = user => {
  const html = $('<span/>')
    .text(user.name)
    .addClass('user badge badge-dark')
    .addClass(user.name.color());
  
  if (instructor && user.id != id) {
    html.click(e => {
      $('#to').selectpicker('val', user.id);
    });
  }

  return html;
};

const addOption = user => {
  $("<option/>", {
    value: user.id,
    'data-content': badge(user).prop('outerHTML')
  }).data('user', user).appendTo('#to');

  $('#to').selectpicker('refresh');
};

const addUser = user => {
  if (!users.includes(user.id)) {
    users.push(user.id);

    $("<span>")
      .attr('data-id', user.id)
      .append(badge(user))
      .append('<br/>')
      .appendTo('#users');
    
    // don't add ourselves to the to dropdown
    if (user.id != id) {
      addOption(user);
    }
  }
};

const removeUser = user => {
  const index = users.indexOf(user.id);

  if (index > -1) {
    users.splice(index, 1);
  }

  $(`#users > span[data-id='${user.id}'`).remove();
  $(`#to > option[data-id='${user.id}'`).remove();
  $('#to').selectpicker('refresh');
};

const addMessage = message => {
  var html = $('<div/>')
    .addClass('message')
    .append(badge(message.from));

  if (instructor) {
    html.append("&rarr;").append(badge(message.to));

    if (message.from.id != id) {
      html.click(e => {
        $('#to').selectpicker('val', message.from.id);
      });
    }
  }

  html.append(': ').append(
    DOMPurify.sanitize(marked(message.text))
  ).appendTo('#messages');
  
  // auto-scroll
  $('#messages').stop().animate({ 
    scrollTop: $('#messages').prop('scrollHeight')
  }, 1000);
};

$(document).ready(() => {
  $.post(location.pathname + '/enter');
  
  window.onbeforeunload = () => {
    navigator.sendBeacon(location.pathname + '/leave');
  }

  // add groups to the drop-down
  addOption({ id: 'instructors', name: 'Instructors' });
  addOption({ id: 'everyone', name: 'Everyone' });

  $('#message').keypress(function(e) {
    if(this.value.length > 0 && e.which == 13) {
      if (instructor) {
        const to = $('#to > option:selected').data('user');
        $.post(location.pathname, { to: to, text: this.value });
      } else {
        $.post(location.pathname, { text: this.value });
      }
      
      this.value = "";
    }
  });

  MessageBus.subscribe(location.pathname, addMessage, 0);
  MessageBus.subscribe(location.pathname + '/enter', addUser, 0);
  MessageBus.subscribe(location.pathname + '/leave', removeUser, 0);
});
