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
                    var week_start = this._getBeginningOfWeek(new_value);
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        me._mask("Gathering timesheet data...");
                        me._getTimesheets();
                    }
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
                    if ( week_start !== new_value ) {
                        dp.setValue(week_start);
                    }
                    if ( new_value.getDay() === 0 ) {
                        me._mask("Gathering timesheet data...",me);
                        me._getTimesheets();
                    }
                }
            }
        });
        start_selector.setValue(new Date());
        end_selector.setValue(new Date());
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
    _getTimesheets: function() {
        this.logger.log("_getTimesheets");
        var start_end = this._getTimeRange();

        if ( start_end.length == 2 ) {
            this.logger.log("  Start/End ", start_end);
            var first_week = start_end[0];
            var last_week = start_end[1];
        
            if ( this.grid ) { this.grid.destroy(); }
            var start_date = Rally.util.DateTime.toIsoString(first_week,true).replace(/T.*$/,"T00:00:00.000Z");
            var end_date = Rally.util.DateTime.toIsoString(last_week,true).replace(/T.*$/,"T00:00:00.000Z");
            
            Ext.create('Rally.data.wsapi.Store',{
                autoLoad: true,
                model:'TimeEntryValue',
                filters: [
                    {property:'TimeEntryItem.WeekStartDate',operator:'>=',value:start_date},
                    {property:'TimeEntryItem.WeekStartDate',operator:'<=',value:end_date},
                    {property:'TimeEntryItem.Task',operator:'!=',value:''}
                ],
                fetch: ['User','UserName','ObjectID','Hours','TimeEntryItem','Task','FormattedID',
                    'Name','WorkProduct','Feature','Parent'],
                listeners: {
                    scope: this,
                    load: function(store,records){
                        var me = this;
                        var tasks_by_user = {}; // key is FormattedID_UserObjectID
                        Ext.Array.each( records, function(record) {
                            me.logger.log(' time: ',record);
                            var time_entry_item = record.get('TimeEntryItem');
                            var key = time_entry_item.Task.FormattedID + "_" + time_entry_item.User.ObjectID;
                            if ( ! tasks_by_user[key] ) {
                                tasks_by_user[key] = me._getObjectFromTimeValue( record );
                            }   
                            var hours = record.get('Hours') || 0;
                            tasks_by_user[key].total = tasks_by_user[key].total + hours;
                        });
                        
                        this._makeGrid(tasks_by_user);
                    }
                }
            });
        }
    },
    _getObjectFromTimeValue: function(record){
        var time_entry_item = record.get('TimeEntryItem');
        var workproduct = time_entry_item.WorkProduct || { FormattedID: "", Name: "" };
        var feature = workproduct.Feature || { FormattedID: "", Name: "" };
        var initiative = feature.Parent || { FormattedID: "", Name: "" };
        return {
            total: 0,
            user: time_entry_item.User.UserName,
            task_fid: time_entry_item.Task.FormattedID,
            task_name: time_entry_item.Task.Name,
            workproduct_fid: workproduct.FormattedID,
            workproduct_name: workproduct.Name,
            feature_fid: feature.FormattedID,
            feature_name: feature.Name,
            initiative_fid: initiative.FormattedID,
            initiative_name: initiative.Name
        };
    },
    _makeGrid: function(tasks_by_user) {
        this.logger.log("_makeGrid", tasks_by_user);
        var me = this;
        var store = Ext.create('Rally.data.custom.Store', {
            model: 'Time',
            autoLoad: true,
            data :me._hashToArray(tasks_by_user)
        });
        
        //me.logger.log(' store thinks', store.getTotalCount());
        
        this.grid = this.down('#grid_box').add({
            xtype:'rallygrid',
            store: store,
            pagingToolbarCfg: {
               pageSizes: [10, 25, 50],
               store: store
            },
            columnCfgs: [
                {text:'User',dataIndex:'user'},
                {text:'Task', columns:[
                    {text:'ID', dataIndex: 'task_fid', sortable: true, menuDisabled: true },
                    {text:'Name', dataIndex: 'task_name', sortable: true, menuDisabled: true}
                ]},
                {text:'WorkProduct',columns:[
                    {text:'ID', dataIndex: 'workproduct_fid', sortable: true, menuDisabled: true},
                    {text:'Name', dataIndex: 'workproduct_name', sortable: true, menuDisabled: true}
                ]},
                {text:'Feature',columns:[
                    {text:'ID', dataIndex: 'feature_fid', sortable: true, menuDisabled: true},
                    {text:'Name', dataIndex: 'feature_name', sortable: true, menuDisabled: true}
                ]},
                {text:'Initiative',columns:[
                    {text:'ID', dataIndex: 'initiative_fid', sortable: true, menuDisabled: true},
                    {text:'Name', dataIndex: 'initiative_name', sortable: true, menuDisabled: true}
                ]},
                {text:'Hours', dataIndex:'total'}
            ]
        });
        
        me._unmask();
    },
    _hashToArray: function(hash) {
        var result_array = [];
        Ext.Object.each(hash, function(key,value){
            result_array.push(value);
        });
        return result_array;
    }
});
