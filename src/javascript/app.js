Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container', defaults: { margin: 5, padding: 5 }, layout: { type: 'hbox' }, items:[
            {xtype:'container',itemId:'date_selector_box'}, 
            {xtype:'container',itemId:'save_button_box'}
        ]},
        {xtype:'container',itemId:'grid_box', padding: 10, margin: 10 },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addDateSelectors();
        
        if ( this._isAbleToDownloadFiles() ) {
            this._addDownloadButton();
        }
        if (typeof(this.getAppId()) == 'undefined' ) {
            // not inside Rally
            this._showExternalSettingsDialog(this.getSettingsFields());
        }
    },
    _addDateSelectors: function() {
        var me = this;
        var start_selector = this.down('#date_selector_box').add({
            xtype:'rallydatefield',
            itemId:'start_date_selector',
            fieldLabel: 'Include weeks from:',
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                        me._mask("Gathering timesheet data...");
                        me._getTimesheets();
                }
            }
        });
        var end_selector = this.down('#date_selector_box').add({
            xtype:'rallydatefield',
            itemId:'end_date_selector',
            fieldLabel: 'to:',
            listeners: {
                scope: this,
                change: function(dp, new_value) {
                    var week_start = this._getBeginningOfWeek(new_value);
                        me._mask("Gathering timesheet data...",me);
                        me._getTimesheets();
                }
            }
        });
        start_selector.setValue(new Date());
        end_selector.setValue(new Date());
    },
    _addDownloadButton: function() {
        this.down('#save_button_box').add({
            xtype:'rallybutton',
            text:'Export to CSV',
            scope: this,
            handler: function() {
                this._makeCSV();
            }
        });
        
    },
    _getBeginningOfWeek: function(js_date){
        var start_of_week_here = Ext.Date.add(js_date, Ext.Date.DAY, -1 * js_date.getDay());
        return start_of_week_here;
    },
    _getTimeRange: function() {
        this.logger.log("_getTimeRange");
        var start_selector = this.down('#start_date_selector');
        var end_selector = this.down('#end_date_selector');
        
        if ( ! end_selector || ! start_selector ) {
            return [];
        }
        
        var start = start_selector.getValue();
        var end = end_selector.getValue();
                
        if ( ! start || ! end ) {
            return [];
        }
        
        if ( start > end ) { 
            start_selector.setValue(end);
            return [];
        }
        
        return [start,end];
    },
    _mask: function(text) {
        var me = this;
        setTimeout(function(){
            me.setLoading(text);
        },10);
    },
    _unmask: function() {
        this.setLoading(false);
    },
    _getFieldsFromString: function(prefix,field_string){
        var field_array = [];
        if ( field_string ) {
            var values = field_string.split(',');
            Ext.Array.each(values,function(value){
                field_array.push({
                    text: value, 
                    dataIndex: prefix + "_" + value,
                    name: value,
                    sortable: true, 
                    menuDisabled: true
                });
            }); 
        }
        return field_array;
    },
    _getTimesheets: function() {
        this.logger.log("_getTimesheets");
        this.additional_fields_for_stories = this._getFieldsFromString('additional_fields_for_stories',this.getSetting('additional_fields_for_stories'));
        this.additional_fields_for_tasks = this._getFieldsFromString('additional_fields_for_tasks',this.getSetting('additional_fields_for_tasks'));
        this.additional_fields_for_initiatives = this._getFieldsFromString('additional_fields_for_initiatives',this.getSetting('additional_fields_for_initiatives'));
        this.additional_fields_for_features = this._getFieldsFromString('additional_fields_for_features',this.getSetting('additional_fields_for_features'));
                
        var start_end = this._getTimeRange();

        if ( start_end.length == 2 ) {
            this.logger.log("  Start/End ", start_end);
            var first_week = start_end[0];
            var last_week = start_end[1];
        
            if ( this.grid ) { this.grid.destroy(); }
            var start_date = Rally.util.DateTime.toIsoString(this._getBeginningOfWeek(first_week),true).replace(/T.*$/,"T00:00:00.000Z");
            var end_date = Rally.util.DateTime.toIsoString(this._getBeginningOfWeek(last_week),true).replace(/T.*$/,"T00:00:00.000Z");
            
            var fetch = this._getFetchFields();
            
            this.logger.log("Fetch: ",fetch);
            
            Ext.create('Rally.data.wsapi.Store',{
                autoLoad: true,
                model:'TimeEntryValue',
                limit:'Infinity',
                filters: [
                    {property:'TimeEntryItem.WeekStartDate',operator:'>=',value:start_date},
                    {property:'TimeEntryItem.WeekStartDate',operator:'<=',value:end_date},
                    {property:'TimeEntryItem.Task',operator:'!=',value:""}
                ],
                fetch: fetch,
                listeners: {
                    scope: this,
                    load: function(store,records){
                        this.logger.log("Found time values: ", records.length);
                        var me = this;
                        var tasks_by_user = {}; // key is FormattedID_UserObjectID
                        Ext.Array.each( records, function(record) {
                            var check_start = Rally.util.DateTime.toIsoString(start_end[0],true).replace(/T.*$/,"");
                            var check_end = Rally.util.DateTime.toIsoString(start_end[1],true).replace(/T.*$/,"");
                            var time_item_date = Rally.util.DateTime.toIsoString(record.get('DateVal'),true).replace(/T.*$/,"");

                            if (check_start.localeCompare(time_item_date) < 1 && check_end.localeCompare(time_item_date) > -1 ) {
                                
                                var time_entry_item = record.get('TimeEntryItem');
                                if ( time_entry_item.Task === null ) {
                                    me.logger.log('  SKIP null Task');
                                } else {
                                    var user = time_entry_item.User || { ObjectID:-1, UserName:'missing user'};
                                    var key = time_entry_item.Task.FormattedID + "_" + user.ObjectID;
                                    if ( ! tasks_by_user[key] ) {
                                        tasks_by_user[key] = me._getObjectFromTimeValue( record );
                                    }   
                                    var hours = record.get('Hours') || 0;
                                    tasks_by_user[key].total = tasks_by_user[key].total + hours;
                                }
                            }
                        });
                        
                        this._makeGrid(tasks_by_user);
                    }
                }
            });
        }
    },
    _getFetchFields: function() {
        var base_field_array = ['User','UserName','ObjectID','Hours',
            'TimeEntryItem','Task','FormattedID','Name','WorkProduct',
            'Feature','Parent','DateVal', 'Requirement'];
            
        var story_field_array = this._getFetchFieldsFromColumns(this.additional_fields_for_stories);
        var task_field_array = this._getFetchFieldsFromColumns(this.additional_fields_for_tasks);
        var feature_field_array = this._getFetchFieldsFromColumns(this.additional_fields_for_features);
        var initiative_field_array = this._getFetchFieldsFromColumns(this.additional_fields_for_initiatives);

        return Ext.Array.push(base_field_array,story_field_array,task_field_array,feature_field_array,initiative_field_array);
    },
    _getModelFields: function() {
        var fields = [
            {name: 'total',   type: 'int', convert: null},
            {name: 'user',  type: 'string'},
            {name: 'task_fid',  type: 'string'},
            {name: 'task_name',  type: 'string'},
            {name: 'workproduct_fid',  type: 'string'},
            {name: 'workproduct_name',  type: 'string'},
            {name: 'feature_fid',  type: 'string'},
            {name: 'feature_name',  type: 'string'},
            {name: 'initiative_fid',  type: 'string'},
            {name: 'initiative_name',  type: 'string'}
        ];
        
        Ext.Array.each(this.additional_fields_for_stories,function(field){
            fields.push({name:field.dataIndex, type:'string'});
        });
                
        Ext.Array.each(this.additional_fields_for_tasks,function(field){
            fields.push({name:field.dataIndex, type:'string'});
        });
 
        Ext.Array.each(this.additional_fields_for_features,function(field){
            fields.push({name:field.dataIndex, type:'string'});
        });
        
        Ext.Array.each(this.additional_fields_for_initiatives,function(field){
            fields.push({name:field.dataIndex, type:'string'});
        });
        return fields;
    },
    _getFetchFieldsFromColumns: function(columns) {
        var name_array = [];
        Ext.Array.each(columns,function(column){
            name_array.push(column.name);
        });
        return name_array;
    },
    _getObjectFromTimeValue: function(record){
        var time_entry_item = record.get('TimeEntryItem');
        var user = time_entry_item.User || { UserName: 'unknown user' };
        
        var workproduct = time_entry_item.WorkProduct || { FormattedID: "", Name: "" };
        var feature = workproduct.Feature || { FormattedID: "", Name: "" };
        
        if ( workproduct._type == "Defect" && workproduct.Requirement ) {
            feature = workproduct.Requirement.Feature || { FormattedID: "", Name: "" };
        }
        
        var initiative = feature.Parent || { FormattedID: "", Name: "" };

        var time_object =  {
            total: 0,
            user: user.UserName || "Deleted User: " + user._refObjectName,
            task_fid: time_entry_item.Task.FormattedID,
            task_name: time_entry_item.Task.Name,
            workproduct_fid: workproduct.FormattedID,
            workproduct_name: workproduct.Name,
            feature_fid: feature.FormattedID,
            feature_name: feature.Name,
            initiative_fid: initiative.FormattedID,
            initiative_name: initiative.Name
        };
        
        if ( workproduct && workproduct.FormattedID ) {
            Ext.Array.each(this.additional_fields_for_stories,function(column) {
                time_object[column.dataIndex] = workproduct[column.name];
            });
        }
        
        if ( feature && feature.FormattedID ) {
            Ext.Array.each(this.additional_fields_for_features,function(column) {
                time_object[column.dataIndex] = feature[column.name];
            });
        }
         
        if ( initiative && initiative.FormattedID ) {
            Ext.Array.each(this.additional_fields_for_initiatives,function(column) {
                time_object[column.dataIndex] = initiative[column.name];
            });
        }    
        
        Ext.Array.each(this.additional_fields_for_tasks,function(column) {
            time_object[column.dataIndex] = time_entry_item.Task[column.name];
        });
            
        
        return time_object;
    },
    _makeGrid: function(tasks_by_user) {
        this.logger.log("_makeGrid", tasks_by_user);
        var me = this;
        this.data = me._hashToArray(tasks_by_user);
        
        var model_fields = this._getModelFields();
        
        Ext.define('Time', {
            extend: 'Ext.data.Model',
            fields: model_fields
        });

        var store = Ext.create('Rally.data.custom.Store', {
            model: 'Time',
            autoLoad: true,
            data : me.data
        });
        
        //me.logger.log(' store thinks', store.getTotalCount());
        
        var columns = this._getColumns();
        this.logger.log("Column Cfg: ", columns);
        
        this.grid = this.down('#grid_box').add({
            xtype:'rallygrid',
            store: store,
            pagingToolbarCfg: {
               store: store
            },
            columnCfgs: columns
        });
        
        me._unmask();
    },
    _getColumns: function() {
        var task_columns = [
            {text:'User',dataIndex:'user'},
            
            {text:'Task ID', dataIndex: 'task_fid', sortable: true, menuDisabled: true },
            {text:'Task Name', dataIndex: 'task_name', sortable: true, menuDisabled: true}
        ];
        task_columns = Ext.Array.push(task_columns,this.additional_fields_for_tasks);

        var workproduct_columns = [
            {text:'WorkProduct ID', dataIndex: 'workproduct_fid', sortable: true, menuDisabled: true},
            {text:'WorkProduct Name', dataIndex: 'workproduct_name', sortable: true, menuDisabled: true}
        ];
        
        workproduct_columns = Ext.Array.push(workproduct_columns,this.additional_fields_for_stories);
        
        var feature_columns = [
            {text:'Feature ID', dataIndex: 'feature_fid', sortable: true, menuDisabled: true},
            {text:'Feature Name', dataIndex: 'feature_name', sortable: true, menuDisabled: true}
        ];
        
        feature_columns = Ext.Array.push(feature_columns,this.additional_fields_for_features);

        var initiative_columns = [        
            {text:'Initiative ID', dataIndex: 'initiative_fid', sortable: true, menuDisabled: true},
            {text:'Intitiative Name', dataIndex: 'initiative_name', sortable: true, menuDisabled: true}
        ];
        
       initiative_columns = Ext.Array.push(initiative_columns,this.additional_fields_for_initiatives);

        var additional_columns = [
            {text:'Hours', dataIndex:'total'}
        ];
        
        return Ext.Array.push(task_columns,workproduct_columns,feature_columns,initiative_columns,additional_columns);
    },
    _hashToArray: function(hash) {
        var result_array = [];
        Ext.Object.each(hash, function(key,value){
            result_array.push(value);
        });
        return result_array;
    },
    _isAbleToDownloadFiles: function() {
        try { 
            var isFileSaverSupported = !!new Blob(); 
        } catch(e){
            this.logger.log(" NOTE: This browser does not support downloading");
            return false;
        }
        return true;
    },
    _makeCSV: function() {
        var store = this.grid.getStore();
        var columns = this.grid.getColumnCfgs();
        var csv_header_array = [];
        var column_index_array = [];
        Ext.Array.each(columns,function(column){
            csv_header_array.push(column.text);
            column_index_array.push(column.dataIndex);
        });
        var csv=[];
        csv.push(csv_header_array.join(','));
                        
        Ext.Array.each( this.data, function (record) {
            var row_array = [];
            Ext.Array.each(column_index_array, function(index_name){
                var cell_value = record[index_name];
                if ( cell_value && isNaN(cell_value) ) {
                    cell_value = cell_value.replace(/\"/g,"'");
                    cell_value = '"' + cell_value + '"';
                }
                row_array.push(cell_value);
            });
            csv.push(row_array.join(','));
        });
        this.logger.log("csv",csv.join('\r\n'));
        
        var file_name = "timesheet_export.csv";
        var blob = new Blob([csv.join("\r\n")],{type:'text/csv;charset=utf-8'});
        saveAs(blob,file_name);
    },
    // ONLY FOR RUNNING EXTERNALLY
    _showExternalSettingsDialog: function(fields){
        var me = this;
        if ( this.settings_dialog ) { this.settings_dialog.destroy(); }
        this.settings_dialog = Ext.create('Rally.ui.dialog.Dialog', {
             autoShow: false,
             draggable: true,
             width: 400,
             height: 400,
             title: 'Settings',
             buttons: [{ 
                text: 'OK',
                margin: 10,
                handler: function(cmp){
                    var settings = {};
                    Ext.Array.each(fields,function(field){
                        if ( field.xtype == "rallyfieldpicker" ) {
                            var values = cmp.up('rallydialog').down('[name="' + field.name + '"]').getValue();
                            var field_array = [];
                            
                            Ext.Array.each(values,function(value){
                                field_array.push(value.get('name'));
                            });

                            settings[field.name] = field_array.join(',');
                        } else {
                            settings[field.name] = cmp.up('rallydialog').down('[name="' + field.name + '"]').getValue();
                        }
                        me.logger.log("SETTINGS: ",settings);
                    });
                    me.settings = settings;
                    cmp.up('rallydialog').destroy();
                    me._getTimesheets();
                }
            }],
             items: [
                {xtype:'container',html: "&nbsp;", padding: 5, margin: 5},
                {xtype:'container',itemId:'field_box', padding: 5, margin: 5, height:325 }]
         });
         Ext.Array.each(fields,function(field){
            me.settings_dialog.down('#field_box').add(field);
         });
         this.settings_dialog.show();
    },
    getSettingsFields: function() {
        var _chooseOnlyNumberFields = function(field){
            var should_show_field = true;
            var forbidden_fields = ['FormattedID','ObjectID','DragAndDropRank','Name'];
            if ( field.hidden ) {
                should_show_field = false;
            }
            if ( field.attributeDefinition ) {
                var type = field.attributeDefinition.AttributeType;
                if ( type != "QUANTITY" && type != "INTEGER" && type != "DECIMAL"  ) {
                    should_show_field = false;
                }
                if ( Ext.Array.indexOf(forbidden_fields,field.name) > -1 ) {
                    should_show_field = false;
                }
            } else {
                should_show_field = false;
            }
            return should_show_field;
        };
                
        var _ignoreTextFields = function(field){
            var should_show_field = true;
            var forbidden_fields = ['FormattedID','ObjectID','DragAndDropRank','Name'];
            if ( field.hidden ) {
                should_show_field = false;
            }
            if ( field.attributeDefinition ) {
                var type = field.attributeDefinition.AttributeType;
                if ( type == "TEXT" || type == "OBJECT" || type == "COLLECTION" ) {
                    should_show_field = false;
                }
                if ( Ext.Array.indexOf(forbidden_fields,field.name) > -1 ) {
                    should_show_field = false;
                }
            } else {
                should_show_field = false;
            }
            return should_show_field;
        };
        
        return [
            {
                name: 'additional_fields_for_task',
                xtype: 'rallyfieldpicker',
                modelTypes: ['Task'],
                fieldLabel: 'Additional fields for Tasks:',
                _shouldShowField: _ignoreTextFields,
                margin: 10,
                width: 300,
                alwaysExpanded: false,
                autoExpand: true,
                labelWidth: 150,
                listeners: {
                    ready: function(picker){ picker.collapse(); }
                },
                readyEvent: 'ready' //event fired to signify readiness
            },
            {
                name: 'additional_fields_for_stories',
                xtype: 'rallyfieldpicker',
                modelTypes: ['HierarchicalRequirement'],
                fieldLabel: 'Additional fields for Stories:',
                _shouldShowField: _ignoreTextFields,
                margin: 10,
                width: 300,
                alwaysExpanded: false,
                autoExpand: true,
                labelWidth: 150,
                listeners: {
                    ready: function(picker){ picker.collapse(); }
                },
                readyEvent: 'ready' //event fired to signify readiness
            },
            {
                name: 'additional_fields_for_features',
                xtype: 'rallyfieldpicker',
                modelTypes: ['PortfolioItem'],
                fieldLabel: 'Additional fields for Features:',
                _shouldShowField: _ignoreTextFields,
                margin: 10,
                width: 300,
                alwaysExpanded: false,
                autoExpand: true,
                labelWidth: 150,
                listeners: {
                    ready: function(picker){ picker.collapse(); }
                },
                readyEvent: 'ready' //event fired to signify readiness
            },
            {
                name: 'additional_fields_for_initiatives',
                xtype: 'rallyfieldpicker',
                modelTypes: ['PortfolioItem'],
                fieldLabel: 'Additional fields for Initiatives:',
                _shouldShowField: _ignoreTextFields,
                margin: '10px 10px 200px 10px',
                width: 300,
                alwaysExpanded: false,
                autoExpand: true,
                labelWidth: 150,
                listeners: {
                    ready: function(picker){ picker.collapse(); }
                },
                readyEvent: 'ready' //event fired to signify readiness
            }
        ];
    }
});
