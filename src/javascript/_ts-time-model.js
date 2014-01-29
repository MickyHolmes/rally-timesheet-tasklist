Ext.define('Time', {
    extend: 'Ext.data.Model',
    fields: [
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
    ]
});