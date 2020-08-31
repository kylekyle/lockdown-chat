# encoding: UTF-8

require 'roda'
require 'seconds'
require 'message_bus'
require 'dotenv/load'
require 'roda/session_middleware'

require_relative 'middleware/lti'
require_relative 'middleware/session_debugger'

class LockdownChat < Roda
  plugin :json
  plugin :public
  plugin :status_handler
  plugin :slash_path_empty
  plugin :render, engine: 'slim'

  plugin :content_security_policy do |csp|
    csp.default_src :none
    csp.style_src :self
    csp.script_src :self
    csp.font_src :self
    csp.img_src :self
    csp.connect_src :self
    csp.form_action :self
    csp.base_uri :none
    csp.frame_ancestors :none
    csp.block_all_mixed_content
    csp.upgrade_insecure_requests
  end

  groups = { 
    'everyone' => {
      'id' => 'everyone',
      'name' => 'Everyone'
    },
    'instructors' => {
      'id' => 'instructors',
      'name' => 'Instructors'
    }
  }

  MB = MessageBus::Instance.new

  user_lookup = proc do |env|
    r = RodaRequest.new(self, env)
    course_id = r.matched_path.tr('/','')
    r.session[course_id] || {} 
  end

  MB.configure(
    backend: :memory, 
    user_id_lookup: proc {|env| user_lookup[env]['id']},
    group_ids_lookup: proc {|env| user_lookup[env]['groups']}
  )

  plugin :message_bus, message_bus: MB

  # we use this to validate user params 
  plugin :typecast_params
  alias check typecast_params

  # encrypt their session hash so we can securely store
  # information in it
  use RodaSessionMiddleware, 
    secret: ENV['SESSION_SECRET'], 
    cookie_options: { same_site: 'None' }
  
  use LTI
  use Rack::CommonLogger
  use SessionDebugger if ENV['RACK_ENV'] == 'development'
  
  status_handler(404) do
    view :card, locals: {
      title: '¯\_(ツ)_/¯', 
      text: "Whoops! Couldn't find the chat room for your class. Try accessing this page from the link on your Canvas course page."
    }
  end

  route do |r|
    r.public

    r.post 'lti' do
      r.redirect r.POST['custom_canvas_course_id']
    end

    course_ids = session.keys.select{|k| k[/\d+/]}

    r.is proc { course_ids.any? } do 
      course_links = course_ids.map do |course_id|
        course_name = session[course_id]['title']
        course_link = "<a href='/#{course_id}'>#{course_name}</a>"
        "<br>&nbsp;&nbsp;&nbsp;&nbsp;&bull; #{course_link}"
      end
      
      view :card, locals: {
        title: 'LockDown Chat', 
        text: "Here are the courses that you have active sessions for. If the course you're after isn't listed, head to that course's page in Canvas and click the LockDown Chat link in the menu on the left. <br> #{course_links.join}"
      }
    end

    r.on course_ids do |course_id|
      user = session[course_id]
      instructor = user['groups'].include? 'instructors'
      r.message_bus ["/#{course_id}", "/#{course_id}/enter"]

      r.post ['enter', 'leave'] do |action|
        MB.publish(
          "/#{course_id}/#{action}", user,
          user_ids: [user['id']], 
          max_backlog_age: 1.hour,
          group_ids: instructor ? ['everyone'] : ['instructors']
        )
        
        action
      end

      r.is do
        r.get do 
          view :chat, locals: { 
            id: user['id'], 
            title: user['title'],
            instructor: instructor
          }
        end
        
        r.post do
          to = groups['instructors']
          user_ids, group_ids = [], []
          text = check.nonempty_str! 'text'
          
          if instructor
            to = check.Hash! 'to'
            
            if groups.values.include? to 
              group_ids << to['id']
            else
              user_ids << to['id']
            end
          end
          
          message = { 
            to: to,
            from: user,
            text: Rack::Utils.escape_html(text)
          }

          MB.publish(
            "/#{course_id}", message,
            # users always get a copy of what they send
            user_ids: user_ids | [user['id']], 
            # instructors get a copy of everything
            group_ids: group_ids | ['instructors'],
            max_backlog_age: 7.days
          )

          text
        end
      end
    end
  end
end

run LockdownChat.freeze.app