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

(function(global, document, $, plugin){

  var hasHTML5Upload = function() {
    /* detect if ajax upload is supported */
    var xhr = $.ajaxSettings.xhr();
    return !!xhr.upload;    
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
          } else if (runtime=='flash')  {
            uploader = new FlashUploader($form,s); 
          } else {
            uploader = new IframeUploader($form,s); 
          }
          if (typeof uploader == 'object') 
            return false;
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

var xhrMock = { 
    responseText: null,
    responseXML: null,
    status: 0,
    readyState: 0,
    statusText: '',
    getAllResponseHeaders: $.noop,
    setRequestHeader: $.noop,
    open: $.noop
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
  this._xhrsHash = {};
  this._$originContent = $form.html();
  
  var flashId = ++timestamp + '-flash';
  
  var $input = $('input[type="file"]', $form).hide().first();
  var params = {};
  $('input[type="hidden"]', $form).each(function() {
    params[this.name] =  this.value;
  });
  this._params = $.extend(params , s.params || {});
  
  this._flashCallbackName = plugin+'Callback'+(++timestamp);
  global[this._flashCallbackName] = function(callbackData) {
    setTimeout(function() { 
      $flashContainer.trigger('flash' + callbackData.type, [callbackData.obj])},
    0);
  };
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
          error: function(e) { 
            
          },// XXX
          params: {
            flashvars: {
              id: flashId,
              filters: s.fileFilters || '',
              multiple: !!($input.attr('multiple')),
              callbackName: self._flashCallbackName
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
  
  var $flashContainer = $(self.flashObject).parent();
  
  $flashContainer.bind('flashinit.' + plugin , function() {
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
  .bind('flashuploadcompletedata.' + plugin, function(e, load) {
      var xhr = self._xhrsHash[load.fileId];
      xhr.onload(load);
  })
  .bind('flashuploadprocess.' + plugin, function (e, progress) {
      var xhr = self._xhrsHash[progress.fileId];
      xhr.upload.progress(progress);
  });

  $form.bind('submit.' + plugin, function(e) {
     self.upload(); 
     return false;
  });
};

FlashUploader.prototype = {
  destroy: function() {
    delete global[this._flashCallbackName];
    this._$form.removeData(plugin).html(this._$originContent);
  },
  removeFile: function(fileId) {
    var file = this._files[this._lookupFile[fileId]];
    this._total -= file.size;
    this.flashObject.removeFile(fileId);          
  },
  upload: function() {
    var self = this,
    s = this._s, $form = this._$form, files = this._files;
    $.each(files, function(i, file){ 
      // mock xhr object
      var xhr = $.extend({}, xhrMock, {
          onload: function(load) {
            file.loaded = load.total;
            file.complete = true;
            files.loaded ++;
            loaded = sumLoaded(files);
            s.progress.apply($form, [{ loaded: loaded, total: self._total}, xhr ]);
            files.loaded == files.length && s.completeall.call($form, {files: files, total: self._total, loaded: loaded}, xhr);
            $.extend(xhr, {
              status: 200,
              readyState: 4,
              responseText: load.text
            });
            xhr.onreadystatechange();
          },            
          send: function() {
            self.flashObject.uploadFile(file.id, s.url, { 
                params: self._params
            });
          },
          upload: {
            progress: function(progress) {
              file.loaded = progress.loaded;
              var params = [{
                total: self._total,		
                loaded: sumLoaded(files)
              }, null];
              s.progress.apply($form, params);
            }
          }
      });
      
      self._xhrsHash[file.id] = xhr;
      s.xhr = function() {
        return xhr;
      };
      $.ajax(s);
    });
  }
}

function Html5Uploader( $form, s ) {
  this._$form = $form;
  this._files = [];
  this._total = 0;
  this._files.loaded = 0;
  this._s = s;
};
Html5Uploader.prototype = {
  upload: function() {
    var self = this, s = this._s,
        $form = this._$form, files = this._files, total = this._total;
        
    var _xhr = s.xhr;
    $('[type="file"]', this._$form).each(function( i, elem ) {     
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
        files.loaded == files.length && s.completeall.call($form, {total: total, loaded: loaded }, xhr);
      };
      var onprogress = xhr.upload.onprogress = function( progress ) {
         data.loaded = progress.loaded;
         loaded = sumLoaded(files);
          var params = [{
            total: total,		
            loaded:  loaded
          }, xhr];
          s.progress.apply($form, params);
          $(data.elem).trigger('progress', params);          
      };
      
      $.ajax(s);
    });
  }
};

function IframeUploader($form, s ) {
   this._$form = $form;
   this._s = s;
};
IframeUploader.prototype =  {
  upload: function() {
    var s = this._s,
        $form = this._$form,
        form = $form[0],
        // cache original form attributes
        _attr = {
            target: form.target,
            enctype:form.enctype,
            method: form.method,
            action: form.action
        },
        attr = {
            target: 'file-upload-' + timestamp++, 
            enctype: 'multipart/form-data', 
            method: 'POST',
            action: s.url
        },
        $iframe,
        $ajaxData;
    // mock request header types
    var types = {
        'content-type': s.dataType,
        'Last-Modified': null,
        Etag: null
    };
  
    // mock xhr object
    var xhr = $.extend({}, xhrMock, {
        open: function(type, url, async) {
            // create iframe
            $iframe = $('<iframe name="'+attr.target+'" style="display: none;" src="javascript:;"/>').load(onload).insertAfter(form);
            // change form attr to submit in to the iframe and ensure other attr are correct
            $form.attr(attr);
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
            $form.submit();
        },
        getResponseHeader: function(type) {
            return types[type];                 
        },
        abort: close
    });	
    
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
        s.completeall.call($form, null, xhr);
        xhr.onreadystatechange();
        close();
    }   
    
    function close() {
        $form.attr(_attr);
        // by removing iframe without delay FF still shows loading indicator
        setTimeout(function() {  
          $iframe.remove()
        } , 500);
    }
    
    $.ajax(s);
  }
};

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


})(this, window.document, jQuery, 'fileUpload');
