# LockDown Chat

The West Point instance is hosted at https://lockdown.compute.army/.

LockDown Chat is a service that students taking assessment with [Respondus LockDown Browser](https://web.respondus.com/he/lockdownbrowser/) can use to ask their instructors questions. 

Instructors can see every message sent in LockDown Chat, while students can only see messages addressed specifically to them or the *Everyone* group. 

## Deploying

LockDown Chat is written in Ruby 2.7 and built atop the [Roda routing tree web toolkit](https://github.com/jeremyevans/roda). The service script assumes that ruby was installed using [RVM](https://rvm.io/) and the gemset is aliased as follows: 

```bash
$ rvm install 2.7.1
$ rvm alias create lockdown-chat ruby-2.7.1@lockdown-chat --create
$ rvm use lockdown-chat
```

To install project dependencies, run: 

```bash
$ git clone https://github.com/kylekyle/lockdown-chat
$ cd lockdown-chat
$ bundle install
```

Next, create a `.env` file in the project directory that defines the following variables: 

```bash
# the secret and key to authenticates LTI requests from canvas
LTI_KEY=
LTI_SECRET=

# this is used to encrypt session cookies
SESSION_SECRET=
```

While you can pass certificate inormation directly to the [Puma](https://github.com/puma/puma) backend, I recommend using a reverse proxy like [nginx](https://www.nginx.com/). See the config directory for an [example nginx config](config/nginx.conf).

To get a free certificate from [Let's Encrypt!](https://letsencrypt.org), do the following:

```bash 
$ apt install certbot
$ certbot -d LOCKDOWN_CHAT_SERVER_DOMAIN --nginx
```

You can automatically renew the certificate by running `crontab -e` and adding the following line:

```
12 3 * * * certbot renew --post-hook "service nginx restart" -q
```

To configure the server to start automatically when you boot:

```bash
~ $ sudo cp config/lockdown-chat.service /etc/systemd/system/
~ $ sudo systemctl enable lockdown-chat.service 
~ $ sudo service lockdown-chat start
```

## Security

End user sessions are stored as [encrypted cookies](http://roda.jeremyevans.net/rdoc/classes/Roda/RodaPlugins/Sessions.html) on the client. The server also has a strict [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP). Here is the CSP as articulated using [Roda's `content_security_policy` plugin](https://roda.jeremyevans.net/rdoc/classes/Roda/RodaPlugins/ContentSecurityPolicy.html): 
```ruby 
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
```

## Configuring Canvas

To add LockDown Chat to your course, go to *Settings* -> *Apps* in your Canvas course and add a new app. Enter the LTI key and secret from your `.env`, select `Paste XML`, and paste in the XML from here: 

> https://<LOCKDOWN_CHAT_SERVER_DOMAIN>/config.xml

Make sure to add `LOCKDOWN_CHAT_SERVER_DOMAIN` to the LockDown Browser whitelist. 

## Building the webpack bundle

If you need to make changes to `chat.js`, you'll need to re-build the bundle. The bundle was originally built using Node 14.6.0. To re-build: 

```bash
$ cd webpack
$ npm install
$ npx webpack 
```

The bundle and dependencies are output to the `public/dist` directory in the project root. 
