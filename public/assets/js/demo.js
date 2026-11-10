const PRODUCTION = `<HEADER>\tDEMO_PRODUCTION

<SERVER>
\tdefaulthostname=portal.example.com
\trepo=stable
\tserver=0.0.0.0
\tport=2801
\tfrontend=haproxy
</SERVER>

<VIRTUAL_HOSTS>
\t0\tportal.example.com\tPortal
\t1\tapi.example.com\tAPI
</VIRTUAL_HOSTS>

<RESOURCE_LIST>
{
  "resourceMap": [
    {
      "portal": {
        "boolAttribs": {
          "ALLOW_WEBSOCKETS": true,
          "CERTIFICATE_VALIDATION": true
        },
        "intAttribs": {
          "SERVER_TYPE": 1
        },
        "stringAttribs": {
          "RESOURCE_NAME": "portal",
          "TYPE": "https",
          "FORCE_INTERNAL_AUTH_PWD": "demo-only-not-a-real-secret"
        },
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.10"],
          "PORT_LIST": ["443"],
          "DNS_LIST": ["portal.example.com"]
        }
      }
    },
    {
      "api": {
        "boolAttribs": {
          "ALLOW_WEBSOCKETS": false,
          "CERTIFICATE_VALIDATION": true
        },
        "intAttribs": {
          "SERVER_TYPE": 1
        },
        "stringAttribs": {
          "RESOURCE_NAME": "api",
          "TYPE": "https"
        },
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.20"],
          "PORT_LIST": ["443"]
        }
      }
    },
    {
      "legacy": {
        "boolAttribs": {
          "ALLOW_WEBSOCKETS": false
        },
        "intAttribs": {
          "SERVER_TYPE": 2
        },
        "stringAttribs": {
          "RESOURCE_NAME": "legacy",
          "TYPE": "tunnel"
        },
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.30"],
          "PORT_LIST": ["22"]
        }
      }
    }
  ]
}
</RESOURCE_LIST>

<HOST>
\tportal\thttps\tportal.example.com\t443
\tapi\thttps\tapi.example.com\t443
\tlegacy\ttunnel\tlegacy.example.com\t22
</HOST>

<ACL>
\tportal\t*\twebtoken\thigh\t/\tfalse - -
\tapi\t*\twebtoken\thigh\t/\tfalse - -
</ACL>

<ACCESS_CONTROL_LIST>
{
  "access_control_list": [
    {
      "portal": {
        "resource_type": "web",
        "local_service": "/",
        "rules": [
          {
            "group": "*",
            "auth": "webtoken",
            "encryption": "high",
            "ipadress": "*",
            "time": null,
            "path": "/",
            "sso": false,
            "deny": false,
            "disabled": false,
            "behaviormetry": "any"
          }
        ]
      }
    },
    {
      "api": {
        "resource_type": "web",
        "local_service": "/",
        "rules": [
          {
            "group": "*",
            "auth": "webtoken",
            "ipadress": "Internal",
            "time": null,
            "path": "/",
            "sso": false,
            "deny": false,
            "disabled": false,
            "behaviormetry": "any"
          }
        ]
      }
    }
  ]
}
</ACCESS_CONTROL_LIST>

<MENU>
\t/portal\tportal\t-\t-\t-\t-\t"Portal"\t-\tfalse\t-\tfalse\tfalse\t1\tPortal\t-\t-
\t/api\tapi\t-\t-\t-\t-\t"API"\t-\tfalse\t-\tfalse\tfalse\t2\tAPI\t-\t-
</MENU>

<CACHE_CONTROL>
\tportal\t/\tcache
\tapi\t/\tcache
</CACHE_CONTROL>

<HOST_ESIGN>
\tportal\t-\t-\t-\t15\tnone\tfalse\t-\thttp\t-\t-\tV1_0\t45\tfalse\tfalse
\tapi\t-\t-\t-\t15\tnone\tfalse\t-\thttp\t-\t-\tV1_0\t45\tfalse\tfalse
</HOST_ESIGN>

<VH_SELECT_RESOURCES>
{
  "portal": 0,
  "api": 1,
  "legacy": 0
}
</VH_SELECT_RESOURCES>

<NODE_CONFIG-1>
\thostname=node-a
\tcapacity=100
\texternal_ip=192.0.2.100
</NODE_CONFIG-1>

<FUTURE_SECTION>
\tfeature_enabled=true
</FUTURE_SECTION>
`;

const QA = `<HEADER>\tDEMO_QA

<SERVER>
\tdefaulthostname=qa.portal.example.com
\trepo=testing
\tserver=0.0.0.0
\tport=2801
\tfrontend=haproxy
</SERVER>

<VIRTUAL_HOSTS>
\t0\tportal.example.com\tPortal
\t1\tapi.example.com\tAPI
</VIRTUAL_HOSTS>

<RESOURCE_LIST>
{
  "resourceMap": [
    {
      "portal": {
        "boolAttribs": {
          "ALLOW_WEBSOCKETS": true,
          "CERTIFICATE_VALIDATION": false
        },
        "intAttribs": {
          "SERVER_TYPE": 1
        },
        "stringAttribs": {
          "RESOURCE_NAME": "portal",
          "TYPE": "https",
          "FORCE_INTERNAL_AUTH_PWD": "demo-only-not-a-real-secret"
        },
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.10"],
          "PORT_LIST": ["8443"],
          "DNS_LIST": ["qa.portal.example.com"]
        }
      }
    },
    {
      "legacy": {
        "boolAttribs": {
          "ALLOW_WEBSOCKETS": true
        },
        "intAttribs": {
          "SERVER_TYPE": 2
        },
        "stringAttribs": {
          "RESOURCE_NAME": "legacy",
          "TYPE": "tunnel"
        },
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.30"],
          "PORT_LIST": ["22"]
        }
      }
    }
  ]
}
</RESOURCE_LIST>

<HOST>
\tportal\thttps\tqa.portal.example.com\t8443
\tlegacy\ttunnel\tlegacy.example.com\t22
</HOST>

<ACL>
\tportal\t*\tsmstoken\thigh\t/\tfalse - -
</ACL>

<ACCESS_CONTROL_LIST>
{
  "access_control_list": [
    {
      "portal": {
        "resource_type": "web",
        "local_service": "/",
        "rules": [
          {
            "group": "*",
            "auth": "smstoken",
            "encryption": "high",
            "ipadress": "*",
            "time": null,
            "path": "/",
            "sso": false,
            "deny": false,
            "disabled": false,
            "behaviormetry": "any"
          },
          {
            "group": "CN=qa-admins,OU=groups,DC=example,DC=com",
            "auth": "webtoken",
            "ipadress": "192.0.2.0/24",
            "time": null,
            "path": "/admin",
            "sso": false,
            "deny": true,
            "disabled": false,
            "behaviormetry": "all"
          }
        ]
      }
    }
  ]
}
</ACCESS_CONTROL_LIST>

<MENU>
\t/portal\tportal\t-\t-\t-\t-\t"Portal"\t-\tfalse\t-\tfalse\tfalse\t1\tPortal\t-\t-
</MENU>

<CACHE_CONTROL>
\tportal\t/\tno-store
</CACHE_CONTROL>

<HOST_ESIGN>
\tportal\t-\t-\t-\t15\tnone\tfalse\t-\thttp\t-\t-\tV1_0\t45\tfalse\tfalse
</HOST_ESIGN>

<VH_SELECT_RESOURCES>
{
  "portal": 0,
  "legacy": 0
}
</VH_SELECT_RESOURCES>
`;

export const DEMO_ENVIRONMENTS = [
  {
    name: 'Production',
    files: [{ name: 'demo-production.conf', text: PRODUCTION }],
  },
  {
    name: 'QA',
    files: [{ name: 'demo-qa.conf', text: QA }],
  },
];
