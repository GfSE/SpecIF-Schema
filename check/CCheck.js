/*  Schema and constraint checking for native SpecIF v1.2 data in JSON format. 
*   Requires: ajv 4.8 or higher.
*   License: Apache 2.0 (http://www.apache.org/licenses/)
*   Author: se@enso-managers.de, enso managers gmbh, Berlin (http://enso-managers.de)
*   We appreciate any correction, comment or contribution as Github issue (https://github.com/GfSE/SpecIF-Schema/issues)
*
*   Use https://minify-js.com/ to create CCheck.min.js and CCheck.mjs
*/
class CCheck {
    constructor() {
        this.ajv = new Ajv({allErrors: true});
        this.regex = {
            IsoDateTime: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[1-2]\d|30|31)(?:T([0-1]\d|2[0-4]):([0-5]\d):([0-5]\d(?:\.\d{1,3})?)(\+(0\d|11|12):([0-5]\d)|-(0\d|11|12):([0-5]\d)|Z)?)?$/
        };
    }
    checkSchema( data, options ) {
        "use strict";
        // Check data using the supplied schema.
        // An object similar to jqXHR, namely {status:900,statusText:"abc",responseType:"text",responseText:"xyz"}, is returned.
        // Requires: https://github.com/epoberezkin/ajv/releases/tag/4.8.0 or later 
        // ToDo: localize messages, see https://github.com/epoberezkin/ajv-i18n 

        if( !options || !options.schema )
            throw Error("checkSchema options: a schema must be supplied");
        
        // compile the validation routine and apply:
        let validate = this.ajv.compile(options.schema),
            valid = validate(data);
        
        return valid?{ status: 0, statusText: 'SpecIF schema has been checked successfully!' }
                :{ status: 970, statusText: 'SpecIF schema is violated', responseType: 'text', responseText: this.ajv.errorsText(validate.errors) };
    }
    checkConstraints( data, options ) {
        "use strict";
        // Check the constraints of the concrete values in 'data'.
        // SpecIF schema v1.2 is supported.
        // An object similar to jqXHR, namely {status:900,statusText:"abc",responseType:"text",responseText:"xyz"}, is returned.
        // ToDo: localize messages

        // Certain checks are only done, if listed in options.doCheck;
        // the following values are recognized:
        // - 'propertyClass.required' (values of a property)
        // - 'propertyClass.multiple' (values of a property)
        // - 'propertyClass.multiLanguage'
        // - 'statementClass.subjectClasses'
        // - 'statementClass.objectClasses'

        // Certain checks are skipped, if listed in options.dontCheck;
        // the following values are recognized:
        // - 'statement.subject'
        // - 'statement.object'
        // - 'text.length'

        if( !data['$schema'] )
            return { status: 971, statusText: "This constraint checker does not support any SpecIF version below 1.2" };

        switch( data['$schema'] ) {
            case "https://specif.de/v1.2/schema.json":
            case "https://json.schemastore.org/specif-1.2.json":
                break;
            case "https://specif.de/v1.0/schema.json":
            case "https://json.schemastore.org/specif-1.0.json":
                return { status: 971, statusText: "This constraint checker does not support SpecIF version 1.0" };
            case "https://specif.de/v1.1/schema.json":
            case "https://json.schemastore.org/specif-1.1.json":
                return { status: 971, statusText: "This constraint checker does not support SpecIF version 1.1" };
            default:
                return { status: 972, statusText: "Invalid schema location" };
        };

        // Set default:
        if( typeof(options)!='object' ) options = {};
        if( !Array.isArray(options.doCheck) ) options.doCheck = [];  // apply listed checks (which are not included by default)
        if( !Array.isArray(options.dontCheck) ) options.dontCheck = [];  // don't apply listed checks (which are included by default)

        let self = this;

        // Set property names:
        let rClasses = 'resourceClasses',
            sClasses = 'statementClasses',
            pClasses = 'propertyClasses',
            rClass = 'class',
            sClass = 'class',
            pClass = 'class',
            nds = 'nodes',
            subClasses = 'subjectClasses',
            objClasses = 'objectClasses',
            fractionDigits = 'fractionDigits',
            minInclusive = 'minInclusive',
            maxInclusive = 'maxInclusive';

        // Handling return code and error list:
        var errorL=[];

        // ids must be unique unless when used as a reference:
        checkUniqueKeys();

        // dataTypes must respect certain constraints depending on their base type:
        checkDataTypes();

        // A propertyClass' "dataType" must be the key of a member of "dataTypes":
        checkPropertyClasses();

        // A resourceClass' propertyClasses must be propertyClass ids:
        checkResourceClasses();

        // A statementClass' propertyClasses must be propertyClass ids,
        // likewise, it's subjectClasses and objectClasses must be resourceClass or statementClass ids:
        checkStatementClasses();

        // A statement's subject and object must be resource or statement keys:
        checkResources();

        // A statement's subject and object must be resource or statement keys:
        checkStatements();

        // A hierarchy node's "resource" must be the key of a member of "resources":
        checkNodes( data.resources, data[nds], 0 );

        return errorL.length<1?{ status: 0, statusText: 'SpecIF constraints have been checked successfully!' }
                :{ status: 973, statusText: 'SpecIF constraints are violated', responseType: 'text', responseText: errorsText(errorL) };

        // The checking routines:
        function checkUniqueKeys() {
            // All keys consisting of 'id' and 'revision' must be unique (unless when used as a reference).
            // Further conditions: 
            //  - all occurrences of items with the same id have a unique revision.
            //  - or there is just one occurrence of an id without revision

            function duplicateKey(L) {
                if( Array.isArray(L) && L.length>0 ) {

                    // A key consists of id and revision; the combination must be unique.
                    // Add every checked key to allKeys,
                    // return 'undefined', only if all elements of L are not contained in allKeys,
                    // return the first element, which has a duplicate key.
                    // Data arriving here has passed the schema checking, so there is a valid id where it is expected.

                        function containsByKey( L, el ) {
                            // L[i] and el must be an item/key consisting of id and revision
                            // return true, if el is contained in L;
                            let lR, eR=el.revision || '';
                            for( var i=L.length-1;i>-1;i-- ) {
                                lR = L[i].revision || '';
                                if ( L[i].id==el.id && ( lR==eR || lR=='' || eR=='' ) ) return true;
                            };
                            return false;
                        }
                    var dk;
                    for( var i=L.length-1;i>-1;i-- ) {
                        // it has been checked by schema that valid identifiers are present where mandatory:
                        if( L[i].id==undefined ) continue;
                        // But if it is defined, it must be unique:
                        // check the element's id and return in case of duplicate key:
                        if( containsByKey(allKeys,L[i]) ) return L[i];
                        // check the identifiers of enumerated values in a dataType:
                        dk = duplicateKey(L[i].enumeration);
                        if( dk ) return dk;
                        // recursively check the hierarchy's nodes:
                        dk = duplicateKey(L[i].nodes);
                        if( dk ) return dk;
                        // all is fine, but add the latest key to the list:
                        allKeys.push(keyOf(L[i]));
                    };
                };
            }

            // Check all elements for unique keys, i.e. the combination of id and revision):
            let allKeys=[keyOf(data)]; // the list of found keys initially with the id of the SpecIF dataset
            [
                { list:data.dataTypes, name:'dataType or enumerated value' },
                { list:data[pClasses], name:'propertyClass' },
                { list:data[rClasses], name:'resourceClass' },
                { list:data[sClasses], name:'statementClass' },
                { list:data.resources, name:'resource' },
                { list:data.statements, name:'statement' },
                { list:data[nds], name:'node' },
                { list:data.files, name:'file' }
            ].forEach( function( def ) {
                let dK = duplicateKey(def.list);
                if( dK ) errorL.push({status:973, statusText: "key of "+def.name+" '"+dK.id+"' with revision "+dK.revision+" is not unique"});
            });
        }
        function checkDataTypes() {
            data.dataTypes.forEach( function( dT ) {
                switch(dT.type) {
                //    case "xs:boolean": // nothing to check
                    case "xs:double":
                        // we could check whether dT[fractionDigits] is an integer number
                    case "xs:integer":
                        // minInclusive and maxInclusive are optional, so we check also whether they exist:
                        if( typeof(dT[minInclusive])=='number' && typeof(dT[maxInclusive])=='number'
                            && dT[minInclusive]+1>dT[maxInclusive] ) 
                            errorL.push({status:974, statusText: "dataType '"+dT.id+"': "+minInclusive+" must be smaller or equal than "+maxInclusive});
                        // no break;
                    case "xs:dateTime":
                    case "xs:anyURI":
                    case "xs:string":
                        if( Array.isArray(dT.enumeration) ) {
                            // If an enumeration is specified, it has at least one value as defined and checked by the schema:
                            dT.enumeration.forEach( function( el ) {
                                // The presence of valid ids has been checked by schema, now check the values:
                                if( dT.type=="xs:string" ) {
                                    if( !isMultiLanguageValue( el.value ) )
                                        errorL.push({status:974, statusText: "dataType '"+dT.id+"' of type 'xs:string' must have enumerated values, each with a list of multi-language texts"});
                                }
                                else
                                    if( !isString( el.value ) )
                                        errorL.push({status:974, statusText: "dataType '"+dT.id+"' of type '"+dT.type+"' must have enumerated string values"});
                            });
                        };
                        break;
                    case "xs:complexType":
                        // If a sequence is specified, it has at least one value as defined and checked by the schema:
                        dT.sequence.forEach( function( el ) {
                            // A propertyClass' "dataType" must be the key of a member of "dataTypes":
                            if( uniqueKey( data.dataTypes, el.dataType) ) 
                                errorL.push({status:974, statusText: "complex dataType '"+dT.id+"' must reference a valid dataType"});
                        });
						// ToDo: Check that sequence is a tree (does not have a cyclic dependency.
                };
            });
        }
        function checkPropertyClasses() {
            // data[pClasses] is the top-level list of propertyClasses for use by resourceClasses and statementClasses:
            data[pClasses].forEach( function( propertyC ){
                // A propertyClass' "dataType" must be the key of a member of "dataTypes":
                if( uniqueKey( data.dataTypes, propertyC.dataType) ) 
                    errorL.push({status:975, statusText: "property class with identifier '"+propertyC.id+"' must reference a valid dataType"});
                // check the value (to be used by default for an instance's - thus property's value):
                checkValues(propertyC,propertyC.values,"default value for property class '"+propertyC.id+"': ");
            });
        }
        function checkPropertyClassReference(elementC,type) {  
            // elementC is resourceClass or statementClass, check it's list of propertyClasses
            // - a base resourceClass must have a list with at least one propertyClass (usually title or description)
            // - an extension (specialization)of a resourceClass may have zero or more propertyClasses
            // - a statementClass may have zero or more propertyClasses, also no list at all is allowed
            if( Array.isArray( elementC[pClasses] ) ) {
                if( type=='resourceClass' && !elementC['extends'] && elementC[pClasses].length<1 ) 
                        errorL.push({status:976, statusText: "resource class '"+elementC.id+"' must have at least one property class" });

                elementC[pClasses].forEach( function( propertyC ) {
                    // A class's propertyClass,
                    // it must be a valid key of an item in propertyClasses and therefore it must not be 'unique':
                    if( uniqueKey( data.propertyClasses, propertyC ) )
                        errorL.push({status:977, statusText: "property class '"+propertyC.id+"' of element '"+elementC.id+"' must reference an item in 'propertyClasses'" });
                });
            };
        }
        function checkClasses(classL,refL,type,name) {  // class list, list of referencing elements, type of reference, name of the referenced element for error message
            // This routine is used in 4 situations:
            // - In case of resourceClasses, the value of "extends" (if it exists) must be the key of a member of "resourceClasses". 
            // - Similarly for statementClasses.
            // - In case of resources, the value of "class" must be the key of a member of "resourceClasses". 
            // - Similarly for statements.
            refL.forEach( function( el ){
                if( el[type] && uniqueKey(classL, el[type]) ) 
                    errorL.push({status:979, statusText: "key '"+type+"' of item '"+el.id+"' must reference a valid "+name });
                if( Array.isArray(el.instantiation) && el.instantiation.includes('never') && el.instantiation.length>1 ) 
                    errorL.push({status:979, statusText: "Attribute 'instantiation' of item '"+el.id+"' must not include another value, if 'never' is present" });
            });
        }
        function checkResourceClasses() {    
            data[rClasses].forEach( function(resourceC) { checkPropertyClassReference( resourceC, 'resourceClass')} );
            // The key of 'extends' must specify a valid resource class: 
            checkClasses( data[rClasses], data[rClasses], 'extends', 'resourceClass' );
        }
        function checkStatementClasses() {    
            // All statementClass' "subjectClasses" must be the key of a member of "resourceClasses" or "statementClasses". 
            // No subjectClasses resp. objectClasses means all classes are eligible.
            // The propertyClasses have already been checked by checkClsses().
            // "subjectClasses" is optional, but if present, the list may not be empty (as enforced by the schema).
            // Similarly for "objectClasses".
            function missingRef(aCL,cL) {
                if( Array.isArray(cL) ) {
                    // if present, the class list must have at least one member:
                    if( cL.length<1 ) return true;
                };
                return false;
            }
            function invalidRef(aCL,cL) {
                if( Array.isArray(cL) ) {
                    // each value in cL must be the key of a member of aCL:
                    for( var i=cL.length-1;i>-1;i-- ) {
                        if( uniqueKey(aCL, cL[i]) ) return true;
                    }
                };
                return false;
            }
            let aCL = data[rClasses].concat(data[sClasses]);
            data[sClasses].forEach( function( statementC ){
                // For each statement class, check the propertyClasses:
                checkPropertyClassReference( statementC );
                // For each statement class, optionally check subject classes and object classes:
                [subClasses,objClasses].forEach( function(x) {  
                    if( options.doCheck.includes('statementClass.'+x) ) {
                        if( missingRef(aCL, statementC[x]) ) 
                            errorL.push({status:978, statusText: x+" of "+sClass+" '"+statementC.id+"' must reference at least one valid resourceClass or statementClass" });
                        if( invalidRef(aCL, statementC[x]) ) 
                            errorL.push({status:978, statusText: x+" of "+sClass+" '"+statementC.id+"' references at least one invalid resourceClass or statementClass" })
                    };
                });
            });
            // The key of 'extends' must specify a valid statement class: 
            checkClasses( data[sClasses], data[sClasses], 'extends', 'statementClass' );
        }
        function checkResources() { 
            // A resources' value of "class" must be the id of a member of "resourceClasses":
            checkClasses( data[rClasses], data.resources, rClass, 'resourceClass' );
            // property values ("content") must fit the respective class' range:
            checkProperties( data[rClasses], data.resources, rClass );
        }
        function checkStatements() { 
            // (It has been checked before that any "statement" is indeed of type "statementClass").

            // A statements' value of "class" must be the id of a member of "statementClasses":
            checkClasses( data[sClasses], data.statements, sClass, 'statementClass' );

            // A statement's subject and object must be resource or statement keys:
            let instanceL = data.resources.concat(data.statements),
                classL = data[rClasses].concat(data[sClasses]);
            data.statements.forEach( function(sta,i) {

                let subj = itemByKey( instanceL, sta.subject ),   // the statement's subject, can be a resource or a statement
                    obj = itemByKey( instanceL, sta.object );     // the statement's object, can be a resource or a statement

                // A statement's "subject" must be the key of a member of "resources" or "statements":
                if( !subj && options.dontCheck.indexOf('statement.subject')<0 ) 
                    errorL.push({status:980, statusText: "subject of statement["+i+"] with identifier '"+sta.id+"' must reference a valid resource or statement"});

                // Equally, an "object" must be the key of a member of "resources" or "statements":
                if( !obj && options.dontCheck.indexOf('statement.object')<0 ) 
                    errorL.push({status:980, statusText: "object of statement["+i+"] with identifier '"+sta.id+"' must reference a valid resource or statement"});

                // The statement's subject and object may be the same, but not with different revisions:
                if( subj && obj && subj.id == obj.id && subj.revision != obj.revision )
                    errorL.push({status:980, statusText: "subject and object of statement["+i+"] with identifier '"+sta.id+"' may have the same id, but not of different revisions"});

                let staC = itemByKey( data[sClasses], sta[sClass] );   // the statement's class
                
                // The existence of a valid class has been checked before, but a crash shall be avoided:
                if(staC) {
                    // If there are no staC[subClasses], all subjectClasses are eligible and so no checking is necessary.
                    if( Array.isArray(staC[subClasses]) && subj ) {
                        let eligibleCL = [];                              // the list of eligible classes
                        staC[subClasses].forEach( function(c) { let e=itemByKey( classL, c ); if(e) eligibleCL.push(e); });

                        // The subject's class must be listed in the statementClass' subjectClasses;
                        // resources and statements are eligible, both have the same 'class' attribute, so subj[rClass] covers all cases:
                        if( uniqueKey( eligibleCL, subj[rClass] ) )
                            errorL.push({status:981, statusText: "the subject of statement["+i+"] with identifier '"+sta.id+"' has a class which is not listed in the "+subClasses+" of the statement's class"});
                    };

                    // ... and similarly for object's class: 
                    if( Array.isArray(staC[objClasses]) && obj ) {
                        let eligibleCL = [];                              // the list of eligible classes
                        staC[objClasses].forEach( function(c) { let e=itemByKey( classL, c ); if(e) eligibleCL.push(e); });

                        if( uniqueKey( eligibleCL, obj[[rClass]] ) )
                            errorL.push({status:981, statusText: "the object of statement["+i+"] with identifier '"+sta.id+"' has a class which is not listed in the "+objClasses+" of the statement's class"});
                    };
                };
            });

            // property values ("content") must fit the respective class' range:
            checkProperties( data[sClasses], data.statements, sClass );
        }
        function checkValues(prpC,prpValues,etxt) { 
            // prpValues is a list of values per property (new in SpecIF v1.1)
            // - any value is a string except for properties of type 'xs:string', where every value is a list of multilanguage objects
            // - any property value can be enumerated, except for xs:boolean (which is already enumerated ;-)

                function checkValue(val,dT) {

                    // Check the type of the value:
                    if( Array.isArray(dT.enumeration) ) {
                        if( typeof(val)!='object' || !val.id || uniqueKey( dT.enumeration, val ) ) {
                            errorL.push({status:984, statusText: etxt+"all values must be an id of the dataTypes' value enumeration"});
                            return;
                        };
                    }
                    else {
                        switch(dT.type) {
                            case 'xs:string':
                                // The values of a property of type 'xs:string' are multi-language objects:
                                if( !isMultiLanguageValue( val ) ) {
                                    errorL.push({status:985, statusText: etxt+"all values must be a list (of multi-language objects)"});
                                    return;
                                };
                                break;
                            case 'xs:complexType':
								// no more checking beyond schema ...
								break;
                            default:
                                // all other property values are strings, including boolean and numbers:
								if( typeof(val)!='string' ) {
                                    errorL.push({status:985, statusText: etxt+"all values must be a string"});
                                    return;
                                };
                        };

                        switch(dT.type) {
                            case 'xs:boolean':
                                if( val!='true' && val!='false' ) 
                                    errorL.push({status:986, statusText:etxt+"boolean value is invalid"}); 
                                break;
                            case 'xs:dateTime':
                            /* This is too restrictive, as right-truncated data is not accepted:
                            if( self.checkSchema(
                                    {value:val},
                                    {schema: {
                                        "$id": "https://specif.de/v1.1/dateTime/schema#",
                                        "$schema": "http://json-schema.org/draft-04/schema#",
                                //        "$schema": "https://json-schema.org/draft/2019-09/schema#",
                                        "type": "object",
                                        "properties": {
                                          "value": { "type": "string", "format": "date-time" }
                                        }
                                    }}
                                ).status>0 )  */
                                if( !self.regex.IsoDateTime.test(val) )
                                    errorL.push({status:986, statusText: etxt+"value must be a valid date-time string according to ISO 8601"});
                                break;
                            case 'xs:duration':
                                // No check of the value so far. 
                                // In a similar approach we would need JSON Schema draft 2019-09 ... and a newer version of AJV.
                                // Alternative: Apply a RegEx, but results would probably differ from a check built-in with schema 2019-09.
                                // See: https://github.com/GfSE/SpecIF/issues/63
                                break;
                            case 'xs:anyURI':
                                if( self.checkSchema(
                                    {value:val},
                                    {schema: {
                                        "$id": "https://specif.de/v1.1/anyURI/schema#",
                                        "$schema": "http://json-schema.org/draft-04/schema#",
                                //        "$schema": "https://json-schema.org/draft/2019-09/schema#",
                                        "type": "object",
                                        "properties": {
                                          "value": { "type": "string", "format": "uri" }
                                        }
                                    }}
                                ).status>0 )
                                    errorL.push({status:986, statusText: etxt+"value must be a valid URI string according to RFC 3986"});
                                break;
                            case 'xs:integer':
                                // according to the schema, all property values are of type 'string', including the numbers:
                                val = parseInt( val );
                                if( isNaN(val) )
                                    errorL.push({status:986, statusText:etxt+"value is not a valid number"}); 
                                if( dT[minInclusive] && val<dT[minInclusive] ) 
                                    errorL.push({status:986, statusText:etxt+"integer value must be larger than "+dT[minInclusive]});
                                if( dT[maxInclusive] && val>dT[maxInclusive] ) 
                                    errorL.push({status:986, statusText:etxt+"integer value must be smaller than "+dT[maxInclusive]}); 
                                break;
                            case 'xs:double':
                                val = parseFloat( val );
                                if( isNaN(val) )
                                    errorL.push({status:986, statusText:etxt+"value is not a valid number"}); 
                                if( dT[minInclusive] && val<dT[minInclusive] ) 
                                    errorL.push({status:986, statusText:etxt+"double value must be larger than "+dT[minInclusive]});
                                if( dT[maxInclusive] && val>dT[maxInclusive] ) 
                                    errorL.push({status:986, statusText:etxt+"double value must be smaller than "+dT[maxInclusive]}); 
                            //  if( (val*Math.pow(10,dT[fractionDigits])%1)==0 ) return {status:922,statusText:""};
                                break;
                            case 'xs:string': 
                                // A property value of this type is a list of objects with 'text' plus optionally 'format' and 'language' attributes,
                                // no check so far whether text with format 'xhtml' is actually valid XHTML
                                // or whether a IETF language abbreviation is valid:
                                if( Array.isArray(val) ) {

                                    // Optionally check if multiple languages are provided only if the propertyClass specifies "multiLanguage": true:
                                    if( !prpC.multiLanguage && val.length>1 && options.doCheck.includes('propertyClass.multiLanguage') )
                                        errorL.push({status:986, statusText: etxt+"propertyClass does not allow multiple languages"});
                
                                    // val is a list with some text in one or more languages, so check every one of them:
                                    if( typeof(dT.maxLength)=='number' && options.dontCheck.indexOf('text.length')<0 ) {
                                        val.forEach( function(languageO) {
                                            if( languageO['text'].length>dT.maxLength && options.dontCheck.indexOf('text.length')<0 )
                                                errorL.push({status:986, statusText: etxt+"length of string value must not exceed "+dT.maxLength});
                                        });
                                    };
                                }
                                else
                                    errorL.push({status:986, statusText: etxt+"property must be a list of multi-language objects"});
                                break;
                            case 'xs:complexType':

                                // Check for cyclic dependency: ToDo
                                
                                // Each value in a sequence of elements/attributes of a complex dataType must be a SpecIF value:
                                if( Array.isArray(val) ) {
									if( dT.sequence.length == val.length )
										val.forEach( 
											(v,n) => {
												// The n-th value must correspond to the dataType of the n-th element of the complex dataType:
												let edT = itemByKey(data.dataTypes,dT.sequence[n].dataType);
												checkValue(v,edT)
											}                                            
										);
									else
										errorL.push({status:987, statusText: etxt+"length of complex property and of the data-type's sequence must be equal"});
                                }
                                else
                                    errorL.push({status:987, statusText: etxt+"property must be a list of values of a complex dataType"});
                        };
                        // all is fine
                    };
                }

            let dT = itemByKey(data.dataTypes,prpC.dataType);
            if( !dT ) {
                // checkPropertyClasses() already has added an error message for this case, but avoid a crash:
                return;    
            };                

            // The property list is mandatory for resources, but optional for statements;
            // this has been checked by the schema:
            if( Array.isArray(prpValues) ) {

                // Check whether required value(s) are present:
                if( prpC.required && prpValues.length<1 && options.doCheck.includes('propertyClass.required') )
                    errorL.push({status:983, statusText: etxt+"propertyClass requires at least one value"});
                
                // Check the length of the value list:
                if( !prpC.multiple && prpValues.length>1 && options.doCheck.includes('propertyClass.multiple') )
                    errorL.push({status:983, statusText: etxt+"propertyClass does not allow multiple values"});
                
                prpValues.forEach( v => checkValue(v,dT) );
            };
        }
        function checkProperties(classL,instanceL,typ) { 
            // check all properties of the instances listed in instanceL,
            // instanceL: instance list (resources or statements) to be checked
            // classL: the instance's classes (i.e. resourceClasses, if instanceL contains resources)
            instanceL.forEach( function(ins) {
                let allPropertyClasses=[], eTxt,
                    propertyC, 
                    instanceC = itemByKey(classL,ins[typ]); // the instance's class

                if( !instanceC ) {
                    // The instance's class must be a member of classL (has already been checked with checkClasses())
                //  errorL.push({status:977, statusText: typ+" of instance '"+ins.id+"' must reference a valid resourceClass resp. statementClass" }); 
                    return;
                };
                
                // recursively build the list of propertyClasses from the instance's class and any parent classes:
                function addPropertyClasses(insClass) {
                    // any missing class has been discovered before, but shall not lead to a runtime error, here:
                    if( !insClass )
                        return;
                    allPropertyClasses = allPropertyClasses.concat(insClass.propertyClasses||[]);
                    if( typeof(insClass['extends'])=='object' ) addPropertyClasses(itemByKey(classL,insClass['extends']));
                };
                addPropertyClasses(instanceC)
                
                // the list of properties is mandatory for resources, but not for statements:
                if( Array.isArray( ins.properties ) )
                    ins.properties.forEach( function( prp ){
                        eTxt = "property with class '"+prp[pClass].id+"' of instance '"+ins.id+"': ";

                        // Property's propertyClass must point to a propertyClass of the respective resourceClass or statementClass:
                        // a) property class id must be listed by the instance class or the extended instance class:
                        if( uniqueKey( allPropertyClasses, prp[pClass] ) )
                            errorL.push({status:988, statusText: eTxt+"class must be listed with the instance class or a parent instance class"});

                        // b) the referenced property class must be defined:
                        propertyC = itemByKey( data.propertyClasses, prp[pClass] )
                        if( typeof(propertyC)=='object' ) 
                            // Property's value ("content") must fit to the respective type's range
                            checkValues(propertyC,prp.values,eTxt);
                        else
                            errorL.push({status:988, statusText: eTxt+"must reference a valid propertyClass"}); 
                        
                    });
            });
        }
        function checkNodes(rL,ndL,lvl) {    // resourceList, nodeList, hierarchy level
            // Any node's "resource" must be the key of a member of "resources". 
            if( Array.isArray(ndL) ) {
                ndL.forEach( function( nd ){
                    // check the node itself:
                    if( uniqueKey(rL,nd.resource) ) 
                        errorL.push({status:989, statusText: "hierarchy node with identifier '"+nd.id+"' must reference a valid resource"});
                    // recursively check references of next hierarchy levels:
                    checkNodes(rL,nd.nodes,lvl+1);
                });
            };
        }
        function keyOf(el) {
            return {id:el.id,revision:el.revision};
        }
        function isString(el) {
            return typeof(el)=='string';
        }
        function isMultiLanguageValue(L) {
            if (Array.isArray(L)) {
                let hasMultipleLanguages = L.length > 1;
                for (var i = L.length - 1; i > -1; i--) {
                    let lE = L[i];
                    // SpecifMultilanguageText is a list of objects {text:"the text value", language:"IETF language tag"}.
                    // If there are multiple language values, all except the first (=default) must have a language property:
                    if (typeof (lE["text"]) != "string" || (hasMultipleLanguages && i>0 && (typeof (lE.language) != "string" || lE.language.length < 2)))
                        return false;
                };
                return true;
            };
            return false;
        }
        function itemByKey( L, k ) {
            // Return the item in L with key k 
            //  - If an item in list (L) has no specified revision, any reference may not specify a revision.
            //  - If k has no revision, the item in L having the latest revision applies.
            //  - If k has a revision, the item in L having an an equal or the next lower revision applies.

            // Find all elements with the same id:
            let itemsWithEqId = L.filter( function(e) { return e.id==k.id });
            if( itemsWithEqId.length<1 ) return; // no element with the specified id
            
            if( itemsWithEqId.length==1 && !itemsWithEqId[0].revision ) {
                // a single item without revision has been found:
                if( k.revision ) return // revisions don't match (this should not occur)
                return itemsWithEqId[0] // both the found element and the key have no revision
            };
        
            // The elements in L have a revision and there may be more than 1 of them.
            // Sort revisions with descending order:
            itemsWithEqId.sort( function(laurel,hardy) { return hardy.changedAt - laurel.changedAt });
            if( !k.revision ) return itemsWithEqId[0]; // return the latest revision
            
            // Find the element with equal revision:
            let itemsWithEqRev = itemsWithEqId.filter( function(e) { return e.revision==k.revision });
            if( itemsWithEqRev.length>0 ) return itemsWithEqRev[0];
            // else, there is no element with the requested revision:
            // return undefined
        }
        function uniqueKey( L, k ) {
            // Return true, if key k is not present in list of keys L:
            return itemByKey( L, k )==undefined;
        }
        function errorsText(eL) {
            var eT = '';
            eL.forEach( function(e) { eT += (eT.length?',\n':'')+e.statusText+' ('+status+')'} );
            return eT;
        }
    }
}
