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

(function($, window, plugin){

  var hasHTML5Upload = function() {
    /* detect if ajax upload is supported */
    var xhr = $.ajaxSettings.xhr();
    return !!(xhr.sendAsBinary || xhr.upload);    
  };

  $.fn[plugin] = function( method, options ) {
    if ( typeof method != 'string' ) {
        options = method;
        method = null;
    }
    var s = $.extend(true, {}, $.ajaxSettings, arguments.callee.defaults, options);
    
    var ret = this;
    this.each(function(){
      var $form = $(this); 
      
      var instance = $.data(this, plugin ) || $.data(this, plugin, (function() {
        var uploader;
        !s.url && (s.url = $form.attr('action'));
  
        $.each(s.runtime.split(' '), function(i, runtime) {
          if (runtime=='html5' && hasHTML5Upload()) {
            uploader = new Html5Uploader($form,s);
            return false;
          } else if (runtime=='flash')  {
            uploader = new FlashUploader($form,s); 
            return false;
          }
        });
        
        return uploader;
      })());  /* end init instance */
    
      if (method) {
        ret = instance[method](options)
      } else {
        if (typeof instance == 'object') {
          s.autoStart && $form.bind('change.' + plugin, function(e) { 
            instance.upload();
          });
        }
      }
      
    });
    return ret;
  };
  

$.fn[plugin].defaults = {
    runtime: 'html5 flash iframe',    
    dataType: 'json',
    type: 'post',
    url: null,
    params: null,
    autoStart: true,
    filesadd: $.noop,
    progress: $.noop,
    completeall: $.noop
};

var timestamp = (new Date).getTime();

function FlashUploader($form, s ) {
  s = $.extend({
    fileFilters: null,
    swf: 'Upload.swf',
    text: 'Add Files',
    params: null
  }, s);
  var self = this;
  
  this._$form = $form;
  this._files = [];
  this._files.loaded = 0;
  this._total = 0;
  this._s = s;
  this._lookupFile = {};
  this._$originContent = $form.html();
  
  var flashId = ++timestamp + '-flash';
  // XXX
  $.fn[plugin].flash = {
    trigger : function(id, name, obj) {
      setTimeout(function() { $form.trigger('flash' + name, [obj]); }, 0);
    }
  };
  
  var $input = $('input[type="file"]', $form).hide().first();
  var params = {};
  $('input[type="hidden"]', $form).each(function() {
    params[$(this).attr('name')] =  $(this).attr('value');
  });
  this._params = $.extend(params , s.params || {});
    
  $input
    .wrap($('<div />',{
      css: {
        position: 'relative', 
        overflow: 'hidden'
      }
    }))
    .before($('<div />', {
      css: {
        position: 'absolute',
        top: 0,
        width: '100%',
        height: '100%'
      },
      html: function() {
        $(this).flash({
          swf: s.swf,
          version: '9.0.0',
          attr: { id: flashId, width:'100%', height:'100%' },
          error: function(e) { throw e; },// XXX
          params: {
            flashvars: {
              id: flashId,
              filters: s.fileFilters || '',
              multiple: !!($input.attr('multiple'))
            }
          }
        });
        self.flashObject = $(this).flash('get')
      }
    }))
    .before($('<input />',{ type: 'button', value: s.text }))
    .parent()
      .width($input.prev().outerWidth(true))
      .height($input.prev().outerHeight(true));
  
  $form
  .bind('flashinit.' + plugin , function() {
  })
  .bind('flashcancelselect.' + plugin , function() {
  })
  .bind('flashstagerollover.' + plugin, function() {
  })
  .bind('flashselectfiles.' + plugin , function(e, selectedFiles) {
      var files = self._files;
      for (var i = 0; i < selectedFiles.length; i++) {
        var file = selectedFiles[i];
        files.push(file);
        self._lookupFile[file.id] = i;
        self._total+= file.size;
      }
      s.filesadd.apply($form, [files]);
      $(this)
        .trigger("filesadd",files)
        .trigger("change");
  })
  .bind('flashuploadcomplete.' + plugin, function(e, load) {
    var files = self._files,
        file = files[self._lookupFile[load.fileId]];
    file.loaded = load.total;
    file.complete = true;
    files.loaded ++;
    loaded = sumLoaded(files);
    s.progress.apply($form, [{ loaded: loaded, total: self._total}, null]);
    files.loaded == files.length && s.completeall.call($form, {files: files, total: self._total, loaded: loaded}, null);
  })
  .bind('flashuploadprocess.' + plugin, function (e, progress) {
      var files = self._files,
          file = self._files[self._lookupFile[progress.fileId]];
      file.loaded = progress.loaded;
      var params = [{
        total: self._total,		
        loaded: sumLoaded(files)
      }, null];
      s.progress.apply($form, params);
  })
  .bind('submit.' + plugin, function(e) {
      e.preventDefault();
      self.upload();
  });
};

FlashUploader.prototype = {
  destroy: function() {
    this._$form.removeData(plugin).html(this._$originContent);
  },
  removeFile: function(fileId) {
    var file = this._files[this._lookupFile[fileId]];
    this._total -= file.size;
    this.flashObject.removeFile(fileId);          
  },
  upload: function() {
    var self = this;
    $.each(this._files, function(i, file){
      self.flashObject.uploadFile(file.id, self._s.url, { 
        params: self._params
      });          
    });
  }
}

function Html5Uploader( form, s ) {
  var files = [],
      total = 0, loaded = 0, lookupFile = {};
  files.loaded = 0;

  var _xhr = s.xhr;
  // XXX
  this.upload  = function() {
    $('[type="file"]', form).each(function( i, elem ) {     
      this.files.length && $.each(this.files, function(i){
        files.push({ file: this, elem: elem, loaded: 0});
        total += this.fileSize;
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
        xhr.setRequestHeader("Content-Type", "multipart/form-data");
        xhr.setRequestHeader("Cache-Control", "no-cache");
        xhr.setRequestHeader('X-File-Name', file.fileName);
        xhr.setRequestHeader('X-File-Size', file.fileSize);
        _send.call(this, file);
      };
  
      xhr.onload = function( load ) {
        data.loaded = file.fileSize;
        data.complete = true;
        files.loaded ++;
        loaded = sumLoaded(files);
        onprogress.call(this, { loaded: loaded, total: total});
        // XXX trigger func für events + callbacks einsetzen
        files.loaded == files.length && s.completeall.call(form, {total: total, loaded: loaded }, xhr);
      };
      //console.log(xhr.upload, xhr.upload.onprogress);
      var onprogress = xhr.upload.onprogress = function( progress ) {
         data.loaded = progress.loaded;
         loaded = sumLoaded(files);
          var params = [{
            total: total,		
            loaded:  loaded
          }, xhr];
          s.progress.apply(form, params);
          $(data.elem).trigger('progress', params);          
      };
      
      $.ajax(s);
    });
  };
};


function IframeUploader(form, s ) {
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
  }
  
  $.ajax(s);
}

function sumLoaded(files) {
  var loaded = 0;
  for (var i = 0; i < files.length; i++) {
    loaded += files[i].loaded; 
  }
  return loaded;
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


})(jQuery, this, 'fileUpload');
