/** 
 * fileUpload - upload any file using iframe
 * 
 * @todo add ajax upload for modern browsers
 * @depends jquery.js
 * @website jsui.de
 * @version 0.1
 * @author Oleg Slobodskoi aka Kof
 * @credits http://malsup.com/jquery/form/
 * @license Mit Style License
 */

(function($, window){

  $.support.runtime = {
    html5: function() {
      /* detect if ajax upload is supported */
      var xhr = $.ajaxSettings.xhr();
      return !!(xhr.sendAsBinary || xhr.upload);
    },
    flash: function() {
      /* detect if flash upload is supported */
      var version = (function() {
        try { return navigator.plugins['Shockwave Flash'].description; } catch (e) {
          try { return new ActiveXObject('ShockwaveFlash.ShockwaveFlash').GetVariable('$version'); } catch (e) { return '0.0'; }
        }
      })();
      return parseFloat(version.match(/\d+\.\d+/)[0]) >= 10.0;
    },
    iframe: function() { return true; }
  };

  $.fn.fileUpload = function( options ) {
      var s = $.extend(true, {}, $.ajaxSettings, arguments.callee.defaults, options);
      var form = this;
      var uploader = null;
      $.each(s.runtime.split(','), function(i, r) {
        if (typeof $.support.runtime[r] == 'undefined' ) 
          throw ( "no runtime with name :" +r );    
        if ($.support.runtime[r]()) {
          uploader = new Uploader(r,form,s);
          return false; 
        }
      });
      return this;
  };

$.fn.fileUpload.defaults = {
    runtime: 'html5,flash,iframe',
    runtime_defaults: {
      flash: {
      }
    },
    dataType: 'json',
    type: 'post',
    url: null,
    auto_upload: true,
    progress: $.noop,
    completeall: $.noop
};

var timestamp = (new Date).getTime();

function Uploader( r, form, s ) {
  var self = this;
  var _id = guid();
  var files = [],
  total = 0, loaded = 0, lookup_file = {};
  files.loaded = 0;
  
  this.id = function() { return _id; }
  this.runtime = function() { return r; }
  $(form).bind('change', function() {
    (s.auto_upload) &&  self.upload();
  });
  !s.url && (s.url = $(form).attr('action'));
  
  Uploader.Html5Uploader =  {
    init: $.noop, 
    upload: function() {
      var _xhr = s.xhr;
      
      $('[type="file"]', form).each(function( i, elem ){
        this.files.length && $.each(this.files, function(){
          files.push({ file: this, elem: elem});
          total = total + this.fileSize;
        });
      });
      
      $.each(files, function send( i, data ){
          
        var xhr = _xhr(),
          _send = xhr.send,
          file = data.file;
          
        s.xhr = function() {
          return xhr;
        };
    
        xhr.send = function() {
          //xhr.setRequestHeader('Content-Type','application/octet-stream');
          xhr.setRequestHeader("Content-Type", "multipart/form-data");
          xhr.setRequestHeader('X-File-Name', file.fileName);
          xhr.setRequestHeader('X-File-Size', file.fileSize);
          _send.call(this, file);
        };
    
        xhr.onload = function( load ) {
          loaded = loaded + load.total;
          files.loaded ++;
          onprogress.call(this, { loaded: total, total: total});
          files.loaded == files.length && s.completeall.call(form, {total: total, loaded: loaded}, xhr);
        };
        
        var onprogress = xhr.upload.onprogress = function( progress ) {
          var params = [{
            total: total,		
            loaded: loaded + progress.loaded
          },xhr];
          
          s.progress.apply(form, params);
          $(data.elem).trigger('progress', params);
        };
        $.ajax(s);
      });
    }
  }; /* html5 */
  
  Uploader.FlashUploader =  {
    init: function() {
      $.fn.fileUpload.flash = {
        trigger : function(id, name, obj) {
          setTimeout(function() { form.trigger('Flash:' + name, [obj]); }, 0);
        }
      };
      var input = $('input[type="file"]', form).hide()[0];
      $(input).wrap('<div class="flash_container" style="position:relative; overflow:hidden; z-index:99999;" />')
      .before('<div class="flash_overlay" style="position:absolute; top:0;  width:100%; height:100%;">'+
      '<object id="'+_id+'_flash" width="100%" height="100%" style="outline:0" type="application/x-shockwave-flash" data="Upload.swf">' +
      '<param name="movie" value="Upload.swf" />' +
      '<param name="flashvars" value="id='+_id+'_flash" />' +
      '<param name="wmode" value="transparent" />' +
      '<param name="allowscriptaccess" value="always" /></object>'+
      '</div><input type="button" value="Add Files" class="browse" style="z-index:0" />');

      var browse_button = $('.browse', form);
      $('.flash_container', form)
      .width(browse_button.outerWidth(true))
      .height(browse_button.outerHeight(true));

      
      $(form).bind('Flash:Init', function() {  
      })
      .bind('Flash:CancelSelect', function() {
      })
      .bind('Flash:StageEvent:rollOver', function() {
      })
      .bind("Flash:SelectFiles", function(e, selected_files) {
          for (i = 0; i < selected_files.length; i++) {
            var file = selected_files[i];
            files.push(file);
            lookup_file[file.id] = i;
            total+= file.size;
          }
          $(this).trigger("FilesAdded", files);
         (s.auto_upload) &&  $(this).trigger("change");
      })
      .bind("Flash:UploadComplete", function(e, load) {
        var file = files[lookup_file[load.file_id]];
        file.loaded = load.total;
        file.complete = true;
        files.loaded ++;       
        s.progress.apply(form, [{ loaded: sumLoaded(files), total: total}, null]);
        files.loaded == files.length && s.completeall.call(form, {files: files, total: total, loaded: loaded}, null);
      })
      .bind("Flash:UploadProcess", function (e, progress) {
          var file = files[lookup_file[progress.file_id]];
          file.loaded = progress.loaded;
          var params = [{
            total: total,		
            loaded: sumLoaded(files)
          }, null];
          s.progress.apply(form, params);
      });
    },
    upload: function() {
      var flashObject = document.getElementById(_id+'_flash')
      $.each(files, function(i, file){
          flashObject.uploadFile(file.id, s.url, {});          
      });
    }
  }; /* flash */
  
  Uploader.IframeUploader =  {
    init: $.noop, 
    upload: function() {
      var // cache original form attributes
      _attr = {
          target: form.target,
          enctype: form.enctype,
          method: form.method,
          action: form.action
      },
      attr = {
          target: 'file-upload-' + timestamp++, 
          enctype: 'multipart/form-data', 
          method: 'POST',
          action: s.url
      },
      $f = $(form),
      $iframe,
      $ajaxData;
  
      // mock request header types
      var types = {
          'content-type': s.dataType,
          'Last-Modified': null,
          Etag: null
      };
  
      // mock xhr object
      var xhr = { 
          responseText: null,
          responseXML: null,
          status: 0,
          readyState: 0,
          statusText: '',
          getAllResponseHeaders: $.noop,
          setRequestHeader: $.noop,
          open: function(type, url, async) {
              // create iframe
              $iframe = $('<iframe name="'+attr.target+'" style="display: none;" src="javascript:;"/>').load(onload).insertAfter(form);
              // change form attr to submit in to the iframe and ensure other attr are correct
              $f.attr(attr);
              // add fields from ajax settings
              if ( s.data ) {
                  var data = s.data.split('&'),
                      ajaxData = '';
                  $.each(data, function(i,param){
                      param = param.split('=');
                      if ( param[0] && param[1] )
                          ajaxData += '<input type="hidden" name="' + param[0] + '" value="' + param[1] + '" />';
                  });                
                  $ajaxData = $(ajaxData).appendTo(form);
              };
          },
          send: function() {
              // submit form 
              $f.submit();
          },
          getResponseHeader: function(type) {
              return types[type];                 
          },
          abort: close
      };	
      
      s.xhr = function() {
          return xhr;
      };
      
      function onload() {
          var doc = $iframe.contents()[0];
          $.extend(xhr, {
              status: 200,
              readyState: 4,
              responseText: doc.body ? doc.body.innerHTML : null,
              responseXML: doc.XMLDocument ? doc.XMLDocument : doc
          });
          
          if ( s.dataType == 'json' || s.dataType == 'script' ) {
              var ta = doc.getElementsByTagName('textarea')[0];
              xhr.responseText = ta ? ta.value : xhr.responseText;
          } else if ( s.dataType == 'xml' && !xhr.responseXML && xhr.responseText != null ) {
              xhr.responseXML = toXml(xhr.responseText);
          };
  
          xhr.onreadystatechange();
          close();
      }   
      
      function close() {
          $f.attr(_attr); 
           
          // by removing iframe without delay FF still shows loading indicator
          setTimeout($iframe.remove, 500);
      };
      
      $.ajax(s);
    }
  } /* iframe */
  
  $.extend(this, Uploader[r.substr(0, 1).toUpperCase() + r.substr(1)+'Uploader']);
  this.init();
};

function sumLoaded(files) {
  var loaded = 0;
  for (i = 0; i < files.length; i++)
    loaded += files[i].loaded; 
  return loaded;
}

function guid() {
  var S4 = function() { return (((1+Math.random())*0x10000)|0).toString(16).substring(1) };
  return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function toXml( s ) {
    if ( window.ActiveXObject ) {
        var doc = new ActiveXObject('Microsoft.XMLDOM');
        doc.async = 'false';
        doc.loadXML(s);
        return doc;
    } else {
        return (new DOMParser()).parseFromString(s, 'text/xml');
    }
}


})(jQuery, this);
