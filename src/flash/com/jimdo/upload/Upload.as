/* 
@credits Moxiecode Systems AB
*/

package com.jimdo.upload {
  	
  import flash.display.Sprite;
  	import flash.display.MovieClip;
	import flash.display.StageAlign;
	import flash.display.StageScaleMode;
	import flash.net.FileReferenceList;
	import flash.net.FileReference;
  	import flash.events.Event;
  import flash.events.MouseEvent;
	import flash.events.FocusEvent;
  import flash.events.ProgressEvent;
  import flash.events.DataEvent;
  import flash.external.ExternalInterface;
  import flash.utils.Dictionary;
  
  
  public class Upload extends Sprite {
    
    private var clickArea:MovieClip;
    private var fileRefList:FileReferenceList;
		private var files:Dictionary;
    private var fileRef:FileReference;
    private var id:String;
    private var idCounter:int = 0;
    private var currentFile:File;
    
    public function Upload():void {
      stage && init() || addEventListener(Event.ADDED_TO_STAGE, init);
    }
    
    private function init(e:Event = null):void {
      removeEventListener(Event.ADDED_TO_STAGE, init);
      this.id = this.stage.loaderInfo.parameters["id"];
      // Setup file reference list
			this.fileRefList = new FileReferenceList();
			this.fileRefList.addEventListener(Event.CANCEL, cancelEvent);
			this.fileRefList.addEventListener(Event.SELECT, selectEvent);

			this.fileRef = new FileReference();
			this.fileRef.addEventListener(Event.CANCEL, cancelEvent);
			this.fileRef.addEventListener(Event.SELECT, selectEvent);
      this.files = new Dictionary();
      
      // Align and scale stage
			this.stage.align = StageAlign.TOP_LEFT;
			this.stage.scaleMode = StageScaleMode.NO_SCALE;
      // Add something to click on
			this.clickArea = new MovieClip();
			this.clickArea.graphics.beginFill(0xFF0000, 0); // Fill with transparent color
			this.clickArea.graphics.drawRect(0, 0, 1024, 1024);
			this.clickArea.x = 0;
			this.clickArea.y = 0;
			this.clickArea.width = 1024;
			this.clickArea.height = 1024;
			this.clickArea.graphics.endFill();
			this.clickArea.buttonMode = true;
			this.clickArea.useHandCursor = true;
			addChild(this.clickArea);
      this.clickArea.addEventListener(MouseEvent.ROLL_OVER, this.stageEvent);
			this.clickArea.addEventListener(MouseEvent.ROLL_OUT, this.stageEvent);
			this.clickArea.addEventListener(FocusEvent.FOCUS_IN, this.stageEvent);
			this.clickArea.addEventListener(FocusEvent.FOCUS_OUT, this.stageEvent);
      this.clickArea.addEventListener(MouseEvent.CLICK, this.stageClickEvent);

			ExternalInterface.addCallback('uploadFile', this.uploadFile);
      ExternalInterface.addCallback('clearQueue', this.clearFiles);
      this.fireEvent("Init");
    }
    
    private function uploadFile(id:String, url:String, settings:Object):void {
      	var file:File = this.files[id] as File;

      if (file) {
				this.currentFile = file;
				file.upload(url, settings);
			}
    }
    
    private function clearFiles():void {
			this.files = new Dictionary();
		}
    
		private function cancelEvent(e:Event):void {
			this.fireEvent("CancelSelect");
		}
    
    private function selectEvent(e:Event):void {
      var selectedFiles:Array = [], files:Dictionary = this.files;
      
      function processFile(file:File):void {
        
        file.addEventListener(Event.OPEN, function(e:Event):void {
          fireEvent("UploadStart", {
            file_id : file.id
          });
        });
        file.addEventListener(ProgressEvent.PROGRESS, function(e:ProgressEvent):void {          
					var file:File = e.target as File;
					fireEvent("UploadProcess", {
						file_id : file.id,
						loaded : e.bytesLoaded,
						size : e.bytesTotal
					});
				});
        file.addEventListener(Event.COMPLETE, function(e:Event):void {
          fireEvent("UploadComplete", {
            file_id : file.id, 
            total: e.target.size
          });
        });
        file.addEventListener(DataEvent.UPLOAD_COMPLETE_DATA, function(e:DataEvent):void {
					var file:File = e.target as File;
					fireEvent("UploadComplete", {
						file_id : file.id,
						text : e.text
					});
				});
        
        files[file.id] = file;	
        selectedFiles.push({id : file.id, name : file.fileName, size : file.size, loaded : 0});
      }
      
      
      for (var i:Number = 0; i < this.fileRefList.fileList.length; i++) {
        var file:File = new File("file_" + (this.idCounter++), this.fileRefList.fileList[i]);       
        processFile(file);
      }
      
      this.fireEvent("SelectFiles", selectedFiles);
    }
    
    private function stageEvent(e:Event):void {
			this.fireEvent("StageEvent:" + e.type);
		}
    
    private function stageClickEvent(e:Event):void {
      this.fireEvent("StageClick");
      try {
        this.fileRefList.browse();
      } catch(ex:Error) {
        this.fireEvent("SelectError", ex.message);
      }
    }
    
    /**
		 * Fires an event from the flash movie out to the page level JS.
		 *
		 * @param type Name of event to fire.
		 * @param obj Object with optional data.
		 */
		private function fireEvent(type:String, obj:Object = null):void {
			ExternalInterface.call("jQuery.fn.fileUpload.flash.trigger", this.id, type, obj);
		}
        
  }
  
}

// Helper File class

import flash.events.EventDispatcher;
import flash.net.FileReference;
import flash.events.Event;
import flash.events.IOErrorEvent;
import flash.events.ProgressEvent;
import flash.external.ExternalInterface;
import flash.net.URLRequest;
import flash.net.URLVariables;
import flash.net.URLRequestMethod;

class File extends EventDispatcher {
  private var _id:String, _fileName:String, _size:uint, _fileRef:FileReference;

  public function get id():String {
			return this._id;
  }
  
  public function get fileName():String {
    return this._fileName;
  }
  
  public function set fileName(value:String):void {
    this._fileName = value;
  }
  
  public function get size():int {
    return this._size;
	}

  public function File(id:String, file_ref:FileReference) {
    this._id = id;
    this._fileRef = file_ref;
    this._size = file_ref.size;
    this._fileName = file_ref.name;
  }
  
  public function upload(url:String, settings:Object):void {
    var file:File = this;
    var chunk:int, chunks:int, chunkSize:int;
    chunk = 0;
    chunkSize = this.size;
    chunks = 1;
    	
    this._fileRef.addEventListener(Event.OPEN, function(e:Event):void {
      file.dispatchEvent(e);
    });
    this._fileRef.addEventListener(Event.COMPLETE, function(e:Event):void {
      file.dispatchEvent(e);
    });
    this._fileRef.addEventListener(IOErrorEvent.IO_ERROR, function(e:Event):void {
      file.dispatchEvent(e);
    });
    this._fileRef.addEventListener(ProgressEvent.PROGRESS,  function(e:Event):void {
      file.dispatchEvent(e);
    });
    
    //this._fileRef.load();
   
    /* Simple Upload */
    /* No Custom Header - doesn't support cookies. */
    var url:String = "http://localhost/fileupload/server/test3.php";
    var request:URLRequest = new URLRequest(url);
    request.method = URLRequestMethod.POST;
    var postvars:URLVariables = new URLVariables();
    request.data = postvars;
    this._fileRef.upload(request, "Filedata");
    
  }

}
