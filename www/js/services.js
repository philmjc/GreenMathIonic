'use strict';

angular.module('cap.services', ['ngResource'])
  //.constant("baseURL","http://localhost:3000/")
  .constant("baseURL","http://192.168.1.66:6001/")

  /*
   *** The AI module for dynamically creating interactive content
   *** from seed data downloaded from db
   */
  .factory('aiFactory', [function() {
    var aifac = {};
    var data;
    var track = 0;
    aifac.setData = function(array) {
      data = array;
    };
    // Returns a random integer between min (included) and max (included)
    aifac.getRnd = function(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    aifac.gen = function(cor) {
      // GENERATES CORE ENVIRONMENT DATA FROM THE SEED
      return cor.envir.facs.map(function(facx) {
          var yrs = aifac.getRnd(9,12);
          var rate = aifac.getRnd(1,9);
          return facx.map(function(fac) {
            return [
              (yrs * rate * fac), // init
              (rate * fac)        // rate
            ];
          });
      });
    };
    /**
      *** Functions cannot be stored in the db so they have to be parsd
      *** from data arrays.
      */
    // Parse in a function which takes and returns a Number result
    aifac.genN = function(z) {
      if (Array.isArray(z)) {
        switch (z[0]) {
          case '+' : return aifac.genN(z[1]) + aifac.genN(z[2]);
          case '-' : return aifac.genN(z[1]) - aifac.genN(z[2]);
          case '*' : return aifac.genN(z[1]) * aifac.genN(z[2]);
          case '/' : return aifac.genN(z[1]) / aifac.genN(z[2]);
          default  : return data[z[0]][z[1]][z[2]];
        }
      } else return z;
    };
    // Parse in a function which takes and return a String result
    aifac.genS = function(z) {
      var s = "";
      var i;
      for (i = 0; i < z.length; i++) {
        if (Array.isArray(z[i])) s += aifac.genN(z[i]);
        else s += z[i];
      }
      return s;
    };
    return aifac;
  }])

  .factory('courseFactory',['$resource', 'baseURL', function($resource,baseURL) {
     return $resource(baseURL + "courses/:id", null,  {'update':{method:'PUT' }});
  }])

  .factory('userFactory', ['$resource', 'baseURL', '$localStorage',
   function($resource, baseURL, $localStorage) {
    var userfac = {};
    var USER_KEY = 'user';
    // Retrieve user from local storage (or create new one) then set user up for TRIAL MODE.
    var user = $localStorage.getObject(USER_KEY, '{}');

    // Helper function - finds index of an existing courseId to
    // prevent duplicate course additiions
    userfac.getCsIndex = function(array, cId) {
      var index = -1;
      for (var i = 0; i < array.length; i++) {
        if (array[i]._id === cId) index = i;
      }
      return index;
    };
    /*
    *** ANDROID WON'T LET ME USE Oject.assign - had to change all code
      userfac.updateUser = function(obj) {
      user = Object.assign(user, obj);
      $localStorage.updateObject(USER_KEY, obj);
    };
    */
    userfac.getUser = function() {
      return user;
    };
    // Helper - finds index of array element
    function findIndex(array, cb) {
      for (var i = 0; i < array.length; i++) {
        if (cb(array[i])) return i;
      }
      return -1;
    }
    // helper fn which sets the user's current course id and caches it's index
    // (in [courses]) for quick access
    userfac.setCurr = function(currId, currIndex) {
      //if (currIndex) userfac.updateUser({curr:currId,currIndex:currIndex});
      if (currIndex) {
        user.curr = currId;
        user.currIndex = currIndex;
      }
      else if (user.courses) {
        var ids = user.courses.map(function(el) {return el._id;});
        var index = ids.indexOf(currId);
        //if (index >= 0) userfac.updateUser({curr:currId,currIndex:index});
        if (index >= 0) {
          user.curr = currId;
          user.currIndex = index;
        }
        //else userfac.updateUser({curr:currId});
        else user.curr = currId;
      }
      //else userfac.updateUser({curr:currId});
      user.curr = currId;
    };
    // Add course id to user.
    userfac.addCourse = function(course) {
      if (!course) return;
      if (!user.courses) user.courses = [];
      // Check it's not already added
      if (findIndex(user.courses,function(c) {
          return c._id === course._id;
        }) === -1) {
        user.courses.push(course);
        userfac.setCurr(course._id, user.courses.length - 1);
        //$localStorage.updateObject(USER_KEY, user.courses);
        var obj = $localStorage.getObject(USER_KEY, '{}');
        if (obj) obj.courses = user.courses;
        else obj.courses =[course];
        $localStorage.storeObject(USER_KEY, obj);
      }
    };
    /*
    *** Users progress for each course is a subdocument of that course
    *** This helper function does all the access navigation
    */
    userfac.getProgress = function(id) {
      if (!user.courses) return false;
      if (!id && user.currIndex) {
        if (!user.courses[user.currIndex].prog) user.courses[user.currIndex].prog = {track:0};
        return user.courses[user.currIndex].prog;
      }
      var ids = user.courses.map(function(el) {return el._id;});
      var i = id ? id : user.curr;
      var index = ids.indexOf(i);
      if (index < 0) return false;
      //userfac.updateUser({currIndex:index});
      user.currIndex = index;
      if (!user.courses[index].prog) user.courses[index].prog = {track:0};
      return user.courses[index].prog;
    };
    // Helper to update progress.
    userfac.updateProgress = function(obj, courseId) {
      var pro = courseId ? userfac.getProgress(courseId) : userfac.getProgress();
      // Object.assign(pro, obj);
      for (var prop in obj) {
        pro[prop] = obj[prop];
      }
      $localStorage.storeObject(USER_KEY, user);
    };
    userfac.updateTrack = function(obj) {
      var prog = userfac.getProgress();
      if (obj.track) {
        if (obj.track > prog.track) {
          prog.track = obj.track;
          $localStorage.storeObject(USER_KEY, user);
        }
      }
    };
    // Helper fn to get data to show bar chart for users progress
    userfac.getChartData = function(courseId, index) {
      var scores;
      if (index) scores = user.courses[index].prog.scores;
      else scores = userfac.getProgress(courseId).scores;
      if (!scores) return undefined;
      var data = [];
      for (var i = 0 ; i < scores.length ; i++) {
        for (var j = 0 ; j < scores[i].length ; j++) {
          for (var k = 0 ; k < scores[i][j].length ; k++) {
            var l = scores[i][j][k].length;
            if (l > 0)
            data.push ({
              challenge : i + 1,
              repeat : j + 1,
              qu : k,
              attempts : l,
              score : scores[i][j][k][l-1]
            });
          }
        }
      }
      return data;
    };

    // get user from db
    userfac.getUsers = function() {
      return $resource(baseURL + "users/:email", null, {'update':{method:'PUT' }});
    };

    // Initial setup of user
    //if (user.username) userfac.updateUser({isAuthenticated : false}); // force auto login
    if (user.username) user.isAuthenticated = false;
    //else userfac.updateUser({newUser : true});
    else user.newUser = true;

    return userfac;
  }])

  .factory('$localStorage', ['$window', function ($window) {
    return {
        store: function (key, value) {
            $window.localStorage[key] = value;
        },
        get: function (key, defaultValue) {
            return $window.localStorage[key] || defaultValue;
        },
        remove: function (key) {
            $window.localStorage.removeItem(key);
        },
        storeObject: function (key, value) {
            $window.localStorage[key] = JSON.stringify(value);
        },
        getObject: function (key, defaultValue) {
            return JSON.parse($window.localStorage[key] || defaultValue);
        },
        updateObject : function(key, obj) {
          var stored = this.getObject(key, '{}');
          this.storeObject(key, Object.assign(stored, obj));
        }
    };
  }])
  /*
  *** DUAL login + register
  *** Most of this is for demo or future reference while in Free Trial Mode.
  */
  .factory('authFactory', ['$resource', 'baseURL', '$http', '$localStorage', 'userFactory',
    function($resource, baseURL, $http, $localStorage, uF) {

    var authFac = {};
    var SECURE_KEY = 'secure';
    // Make it available on scope
    authFac.SECURE_KEY = SECURE_KEY;

    // keep track of where user was before login
    authFac.setState = function(state) {
      this.currState = state;
    };

    authFac.register = function() {
      return $resource(baseURL + "users/register/:_id", null);
    };

    authFac.login = function() {
      return $resource(baseURL + "users/login/:_id", null);
    };

    ///DUAL automatic login (+ enroll) (for quicker response)
    authFac.autoLogin = function(user) {
      //retrieve password
      var secure = $localStorage.getObject(SECURE_KEY, '{}');
      if (!user.username || !secure.password) return;
      authFac.login().save({
        username : user.username,
        password : secure.password,
      }).$promise.then(
           (function(response){
               // Store token
               authFac.storeUserCredentials(response.token);
               // Sync the users list of courses
               response.courses.forEach(function(course) {
                 uF.addCourse(course);
               });
           }).bind(this),
           (function(response) {

           }).bind(this));
     };

    function loadUserCredentials() {
      var credentials = $localStorage.getObject(SECURE_KEY,'{}');
      if (credentials.username !== undefined) {
        useCredentials(credentials);
      }
    }

    authFac.storeUserCredentials = function(token) {
      //$localStorage.updateObject(SECURE_KEY, credentials);
      var secure = $localStorage.getObject(SECURE_KEY, '{}');
      secure.token = token;
      $localStorage.storeObject(SECURE_KEY, secure);
      useCredentials(token);
    };

    function useCredentials(token) {
      //uF.updateUser({isAuthenticated : true});
      uF.getUser().isAuthenticated = true;
      // Set the token as header for your requests!
      $http.defaults.headers.common['x-access-token'] = token;
    }

    authFac.destroyUserCredentials = function() {
      //uF.updateUser({isAuthenticated : false});
      uF.getUser().isAuthenticated = false;
      $http.defaults.headers.common['x-access-token'] = undefined;
      //$localStorage.updateObject(SECURE_KEY, {token: undefined});
      authFac.storeUserCredentials(undefined);
    };
    authFac.logout = function() {
        // $resource(baseURL + "users/logout").get(function(response){});
        this.destroyUserCredentials();
    };

    // Auto login user
    authFac.autoLogin(uF.getUser());

    return authFac;
  }])
;
